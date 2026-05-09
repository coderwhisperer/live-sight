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
  // 30s safety timer — force-ends a runaway recording so the UI never
  // sits in 'recording' forever if pointerup/cancel/leave all somehow miss.
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

  // ── single-tap flow ─────────────────────────────────────────────────
  // Tap fires /describe in the current mode. In Ask mode, tap falls
  // through to scene description so the giant button is never a no-op.
  const handleSingleTap = async () => {
    if (phase !== 'idle') return;
    audioCue.captureStart();
    setPhase('capturing');
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    setWasRecall(false);
    const captureMode: Mode = mode === 'ask' ? 'scene' : mode;
    try {
      const imageB64 = await capture();
      const result = await describe({ image_b64: imageB64, mode: captureMode });
      setDescription(result.description);
      setLatencyMs(result.latency_ms);
      audioCue.responseReady();
      haptic.success();
      // Fire-and-forget: feeds nightly LoRA training. The returned id lets
      // CorrectionUI PATCH the same row with a user_correction.
      interactionLog({
        image_b64: imageB64,
        mode: captureMode,
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

  // ── long-press flow (record → transcribe → query/recall) ────────────
  // Available in EVERY mode now, not just Ask. CameraButton's 400ms
  // timer decides tap vs hold and routes to the right handler.
  const handleAskStart = async () => {
    console.log('[App] handleAskStart ENTER', { phase });
    if (phase !== 'idle') {
      console.log('[App] handleAskStart: not idle, returning');
      return;
    }
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    setWasRecall(false);
    try {
      // Capture the photo at press start so the picture matches the moment
      // the user begins speaking — not several seconds later when they let
      // go. Stored on a ref because we need it after the await chain.
      console.log('[App] capturing photo at press start');
      askImageB64Ref.current = await capture();
      console.log('[App] photo captured', {
        size: askImageB64Ref.current?.length,
      });
    } catch (err) {
      console.error('[App] capture failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Capture failed: ${msg}`);
      audioCue.error();
      haptic.error();
      return;
    }
    try {
      console.log('[App] requesting mic stream');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      console.log('[App] mic stream acquired', {
        tracks: stream.getTracks().length,
      });
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
      console.log('[App] recorder started, phase -> recording, state=', recorder.state);
      // Belt-and-suspenders: if pointerup/leave/cancel all somehow miss,
      // this fires after 30s and force-ends so the UI exits 'recording'.
      safetyTimerRef.current = window.setTimeout(() => {
        console.warn('[App] Safety timeout — recording over 30s, force-ending');
        if (mediaRecorderRef.current?.state === 'recording') {
          handleAskEnd();
        }
      }, 30000);
    } catch (err) {
      console.error('[App] mic/recorder failed', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Microphone access required: ${msg}`);
      askImageB64Ref.current = null;
      audioCue.error();
      haptic.error();
    }
  };

  const handleAskEnd = async () => {
    console.log('[App] handleAskEnd ENTER', {
      phase,
      hasRecorder: !!mediaRecorderRef.current,
      recorderState: mediaRecorderRef.current?.state,
    });

    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      console.log('[App] handleAskEnd: no recorder, returning');
      return;
    }
    if (recorder.state === 'inactive') {
      console.log('[App] handleAskEnd: recorder already inactive, returning');
      return;
    }

    // Cancel safety timer — this is the user-initiated stop, not a runaway.
    if (safetyTimerRef.current !== null) {
      clearTimeout(safetyTimerRef.current);
      safetyTimerRef.current = null;
    }

    audioCue.recordEnd();
    haptic.recordEnd();

    try {
      console.log('[App] stopping recorder...');
      await new Promise<void>((resolve) => {
        recorder.onstop = () => {
          console.log('[App] recorder.onstop fired');
          resolve();
        };
        recorder.stop();
      });
      console.log('[App] recorder stopped, stopping tracks');
      recorder.stream.getTracks().forEach((t) => t.stop());

      const imageB64 = askImageB64Ref.current;
      if (!imageB64) {
        console.log('[App] no photo captured, error path');
        setErrorMessage('No photo captured for this question');
        audioCue.error();
        haptic.error();
        return;
      }

      console.log('[App] phase -> transcribing');
      setPhase('transcribing');
      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/webm',
      });
      const transcribeResult = await transcribeAudio(audioBlob);
      const transcript = transcribeResult.transcript.trim();
      console.log('[App] transcript', { len: transcript.length });
      if (!transcript) {
        setErrorMessage("Couldn't hear a question — try again.");
        audioCue.error();
        haptic.error();
        return;
      }
      setQuestion(transcript);

      console.log('[App] phase -> querying');
      setPhase('querying');
      // Heuristic intent routing: "where did I put my keys" / "kahan rakhi thi"
      // → /recall (semantic retrieval over past JSONL rows). Anything else →
      // /query (vision call on the current frame).
      const isRecall = looksLikeRecall(transcript);
      const result = isRecall
        ? await recall({ image_b64: imageB64, question: transcript })
        : await query({ image_b64: imageB64, question: transcript });
      console.log('[App] response received', {
        isRecall,
        responseLen: result.response?.length,
      });

      setDescription(result.response);
      setLatencyMs(result.latency_ms);
      setCurrentInteractionId(result.id ?? crypto.randomUUID());
      setWasRecall(isRecall);
      audioCue.responseReady();
      haptic.success();

      if (isRecall && 'retrieved' in result && result.retrieved) {
        console.log('Recall matched:', result.retrieved);
      }
    } catch (err) {
      console.error('[App] handleAskEnd ERROR', err);
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setDescription(null);
      setLatencyMs(null);
      audioCue.error();
      haptic.error();
    } finally {
      console.log('[App] handleAskEnd FINALLY — resetting phase to idle');
      setPhase('idle');
      mediaRecorderRef.current = null;
      askImageB64Ref.current = null;
      if (safetyTimerRef.current !== null) {
        clearTimeout(safetyTimerRef.current);
        safetyTimerRef.current = null;
      }
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-5 px-4 py-5">
      <ModePill value={mode} onChange={setMode} />

      <CameraButton
        mode={mode}
        phase={phase}
        videoRef={videoRef}
        disabled={status !== 'ready'}
        onTap={handleSingleTap}
        onPressStart={handleAskStart}
        onPressEnd={handleAskEnd}
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
