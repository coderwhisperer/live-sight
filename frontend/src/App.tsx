import { useEffect, useRef, useState } from 'react';
import { CameraButton, type CapturePhase } from '@/components/CameraButton';
import { CorrectionUI } from '@/components/CorrectionUI';
import { ModePill, MODE_LABELS } from '@/components/ModePill';
import { ResponseDisplay } from '@/components/ResponseDisplay';
import { useCamera } from '@/hooks/useCamera';
import {
  describe,
  interactionLog,
  query,
  recall,
  transcribeAudio,
} from '@/api/client';
import type { Mode } from '@/api/types';
import { looksLikeRecall } from '@/lib/recallIntent';
import { haptic } from '@/lib/haptic';
import { audioCue } from '@/lib/audioCues';

function App() {
  const [mode, setMode] = useState<Mode>('scene');
  const [description, setDescription] = useState<string | null>(null);
  const [question, setQuestion] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [phase, setPhase] = useState<CapturePhase>('idle');
  const [currentInteractionId, setCurrentInteractionId] = useState<
    string | null
  >(null);
  const [wasRecall, setWasRecall] = useState(false);

  const { status, error: cameraError, videoRef, capture } = useCamera();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const askImageB64Ref = useRef<string | null>(null);
  // 60s safety timer — force-stops if the user starts an Ask recording
  // and forgets to tap again to stop.
  const safetyTimerRef = useRef<number | null>(null);

  // Announce mode changes via TTS + haptic. Skip the very first render
  // so "Scene mode" doesn't blurt out on app load.
  const isFirstModeRender = useRef(true);
  useEffect(() => {
    if (isFirstModeRender.current) {
      isFirstModeRender.current = false;
      return;
    }
    haptic.modeChange();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(`${MODE_LABELS[mode]} mode`);
      u.rate = 1.5;
      u.volume = 0.7;
      window.speechSynthesis.speak(u);
    }
  }, [mode]);

  // ── single-tap describe (navigate / read / scene) ───────────────────
  const captureAndDescribe = async () => {
    if (phase !== 'idle') return;
    audioCue.captureStart();
    setPhase('capturing');
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    setWasRecall(false);
    try {
      const imageB64 = await capture();
      const result = await describe({ image_b64: imageB64, mode });
      setDescription(result.description);
      setLatencyMs(result.latency_ms);
      audioCue.responseReady();
      haptic.success();
      // Fire-and-forget: feeds nightly LoRA training. The returned id lets
      // CorrectionUI PATCH the same row with a user_correction.
      interactionLog({
        image_b64: imageB64,
        mode,
        response: result.description,
      })
        .then(({ id }) => setCurrentInteractionId(id))
        .catch((err) => {
          console.warn('interactionLog failed:', err);
        });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setDescription(null);
      setLatencyMs(null);
      audioCue.error();
      haptic.error();
    } finally {
      setPhase('idle');
    }
  };

  // ── Ask mode tap-to-toggle ──────────────────────────────────────────
  // Tap once to start recording. Tap again to stop, transcribe, query.
  const startRecording = async () => {
    if (phase !== 'idle') return;
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    setWasRecall(false);
    try {
      askImageB64Ref.current = await capture();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setPhase('recording');
      audioCue.recordStart();
      haptic.recordStart();

      // Safety net: if the user walks away or forgets to tap again, stop
      // after 60s so the UI exits 'recording' on its own.
      safetyTimerRef.current = window.setTimeout(() => {
        console.warn('Safety timeout — recording over 60s, force-stopping');
        if (mediaRecorderRef.current?.state === 'recording') {
          stopRecordingAndProcess();
        }
      }, 60000);
    } catch (err) {
      console.error('startRecording failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Microphone access required: ${msg}`);
      askImageB64Ref.current = null;
      audioCue.error();
      haptic.error();
      setPhase('idle');
    }
  };

  const stopRecordingAndProcess = async () => {
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setPhase('idle');
      return;
    }

    audioCue.recordEnd();
    haptic.recordEnd();

    try {
      await new Promise<void>((resolve) => {
        recorder.onstop = () => resolve();
        recorder.stop();
      });
      recorder.stream.getTracks().forEach((t) => t.stop());

      const imageB64 = askImageB64Ref.current;
      if (!imageB64) {
        setErrorMessage('No photo captured for this question');
        audioCue.error();
        haptic.error();
        return;
      }

      setPhase('transcribing');
      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/webm',
      });
      const transcribeResult = await transcribeAudio(audioBlob);
      const transcript = transcribeResult.transcript.trim();
      if (!transcript) {
        setErrorMessage("Couldn't hear a question — tap to record again.");
        audioCue.error();
        haptic.error();
        return;
      }
      setQuestion(transcript);

      setPhase('querying');
      // Heuristic intent routing: "where did I put my keys" / "kahan rakhi thi"
      // → /recall (semantic retrieval over past JSONL rows). Anything else →
      // /query (vision call on the current frame).
      const isRecall = looksLikeRecall(transcript);
      const result = isRecall
        ? await recall({ image_b64: imageB64, question: transcript })
        : await query({ image_b64: imageB64, question: transcript });

      setDescription(result.response);
      setLatencyMs(result.latency_ms);
      setCurrentInteractionId(result.id ?? crypto.randomUUID());
      setWasRecall(isRecall);
      audioCue.responseReady();
      haptic.success();
    } catch (err) {
      console.error('stopRecordingAndProcess failed:', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setDescription(null);
      setLatencyMs(null);
      audioCue.error();
      haptic.error();
    } finally {
      setPhase('idle');
      mediaRecorderRef.current = null;
      askImageB64Ref.current = null;
      audioChunksRef.current = [];
    }
  };

  // ── tap dispatcher ──────────────────────────────────────────────────
  // Single entry point from CameraButton. In Ask mode the tap toggles
  // recording. In other modes it kicks off the describe flow.
  const handleTap = async () => {
    if (mode === 'ask') {
      if (phase === 'idle') {
        await startRecording();
      } else if (phase === 'recording') {
        await stopRecordingAndProcess();
      }
      // transcribing/querying: ignore — the flow is already in flight and
      // CameraButton's isDisabled prevents the click from reaching us anyway.
      return;
    }
    await captureAndDescribe();
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-5">
      <ModePill value={mode} onChange={setMode} />

      <CameraButton
        mode={mode}
        phase={phase}
        videoRef={videoRef}
        disabled={status !== 'ready'}
        onTap={handleTap}
      />

      {status === 'denied' && (
        <p className="text-red-300" role="alert">
          {cameraError ?? 'Camera permission denied'}
        </p>
      )}
      {status === 'error' && cameraError && (
        <p className="text-red-300" role="alert">
          Camera error: {cameraError}
        </p>
      )}

      <ResponseDisplay
        description={description}
        latencyMs={latencyMs}
        errorMessage={errorMessage}
        question={question}
        wasRecall={wasRecall}
      />

      {description && currentInteractionId && (
        <CorrectionUI
          key={currentInteractionId}
          originalResponse={description}
          interactionId={currentInteractionId}
          onClose={() => setCurrentInteractionId(null)}
        />
      )}
    </main>
  );
}

export default App;
