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
    if (phase !== 'idle') return;
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    setWasRecall(false);
    try {
      // Capture the photo at press start so the picture matches the moment
      // the user begins speaking — not several seconds later when they let
      // go. Stored on a ref because we need it after the await chain.
      askImageB64Ref.current = await capture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Capture failed: ${msg}`);
      audioCue.error();
      haptic.error();
      return;
    }
    try {
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Microphone access required: ${msg}`);
      askImageB64Ref.current = null;
      audioCue.error();
      haptic.error();
    }
  };

  const handleAskEnd = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    audioCue.recordEnd();
    haptic.recordEnd();

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    recorder.stream.getTracks().forEach((t) => t.stop());

    const imageB64 = askImageB64Ref.current;
    askImageB64Ref.current = null;
    if (!imageB64) {
      setErrorMessage('No photo captured for this question');
      setPhase('idle');
      audioCue.error();
      haptic.error();
      return;
    }

    setPhase('transcribing');
    let transcript: string;
    try {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/webm',
      });
      const result = await transcribeAudio(audioBlob);
      transcript = result.transcript.trim();
      if (!transcript) {
        setErrorMessage("Couldn't hear a question — try again.");
        setPhase('idle');
        audioCue.error();
        haptic.error();
        return;
      }
      setQuestion(transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Transcription failed: ${msg}`);
      setPhase('idle');
      audioCue.error();
      haptic.error();
      return;
    }

    setPhase('querying');
    try {
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

      if (isRecall && 'retrieved' in result && result.retrieved) {
        console.log('Recall matched:', result.retrieved);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Query failed: ${msg}`);
      setDescription(null);
      setLatencyMs(null);
      audioCue.error();
      haptic.error();
    } finally {
      setPhase('idle');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center gap-6 px-4 py-6">
      <h1 className="text-2xl font-semibold text-slate-900">Live Sight</h1>

      <ModePill value={mode} onChange={setMode} />

      <div className="relative w-full">
        {/* Camera preview is now a corner thumbnail, not the centerpiece —
            sighted demo viewers can still see framing without it dominating
            the layout for blind users. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          aria-hidden="true"
          className="absolute right-2 top-2 z-10 h-20 w-28 rounded-md border border-slate-300 bg-slate-100 object-cover shadow-sm"
        />

        <CameraButton
          mode={mode}
          phase={phase}
          disabled={status !== 'ready'}
          onTap={handleSingleTap}
          onPressStart={handleAskStart}
          onPressEnd={handleAskEnd}
        />
      </div>

      {status === 'denied' && (
        <p className="text-red-700" role="alert">
          {cameraError ?? 'Camera permission denied'}
        </p>
      )}
      {status === 'error' && cameraError && (
        <p className="text-red-700" role="alert">
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
