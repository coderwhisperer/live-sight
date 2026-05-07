import { useRef, useState } from 'react';
import { CameraButton, type CapturePhase } from '@/components/CameraButton';
import { CorrectionUI } from '@/components/CorrectionUI';
import { ModeToggle } from '@/components/ModeToggle';
import { ResponseDisplay } from '@/components/ResponseDisplay';
import { useCamera } from '@/hooks/useCamera';
import {
  describe,
  interactionLog,
  query,
  transcribeAudio,
} from '@/api/client';
import type { Mode } from '@/api/types';

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

  const { status, error: cameraError, videoRef, capture } = useCamera();

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const askImageB64Ref = useRef<string | null>(null);

  // ── single-tap flow (navigate / read / scene) ─────────────────────────
  const handleTap = async () => {
    if (phase !== 'idle') return;
    setPhase('capturing');
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    try {
      const imageB64 = await capture();
      const result = await describe({ image_b64: imageB64, mode });
      setDescription(result.description);
      setLatencyMs(result.latency_ms);
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
    } finally {
      setPhase('idle');
    }
  };

  // ── ask flow (long-press): record → transcribe → query ──────────────
  const handleAskStart = async () => {
    if (phase !== 'idle') return;
    setErrorMessage(null);
    setCurrentInteractionId(null);
    setQuestion(null);
    try {
      // Capture the photo at press start so the picture matches the moment
      // the user begins speaking — not several seconds later when they let
      // go. Stored on a ref because we need it after the await chain.
      askImageB64Ref.current = await capture();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Capture failed: ${msg}`);
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Microphone access required: ${msg}`);
      askImageB64Ref.current = null;
    }
  };

  const handleAskEnd = async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

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
        return;
      }
      setQuestion(transcript);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Transcription failed: ${msg}`);
      setPhase('idle');
      return;
    }

    setPhase('querying');
    try {
      const result = await query({ image_b64: imageB64, question: transcript });
      setDescription(result.response);
      setLatencyMs(result.latency_ms);
      // /query auto-logs an interaction-log row internally with mode="ask",
      // but doesn't return its id. CorrectionUI still mounts so the user can
      // type / dictate a correction; the PATCH will 404 against this random
      // id until the backend exposes the real one in QueryResponse.
      setCurrentInteractionId(crypto.randomUUID());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Query failed: ${msg}`);
      setDescription(null);
      setLatencyMs(null);
    } finally {
      setPhase('idle');
    }
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center gap-6 px-4 py-8">
      <h1 className="text-3xl font-semibold text-slate-900">Live Sight</h1>

      <ModeToggle value={mode} onChange={setMode} />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="w-full max-w-md rounded-lg border border-slate-300 bg-slate-100"
      />

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

      <CameraButton
        mode={mode}
        phase={phase}
        disabled={status !== 'ready'}
        onTap={handleTap}
        onPressStart={handleAskStart}
        onPressEnd={handleAskEnd}
      />

      <ResponseDisplay
        description={description}
        latencyMs={latencyMs}
        errorMessage={errorMessage}
        question={question}
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
