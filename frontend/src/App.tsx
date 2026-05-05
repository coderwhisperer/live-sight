import { useState } from 'react';
import { CameraButton } from '@/components/CameraButton';
import { ModeToggle } from '@/components/ModeToggle';
import { ResponseDisplay } from '@/components/ResponseDisplay';
import { useCamera } from '@/hooks/useCamera';
import { describe } from '@/api/client';
import type { Mode } from '@/api/types';

function App() {
  const [mode, setMode] = useState<Mode>('scene');
  const [description, setDescription] = useState<string | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [inFlight, setInFlight] = useState(false);

  const { status, error: cameraError, videoRef, capture } = useCamera();

  const handleTap = async () => {
    if (inFlight) return;
    setInFlight(true);
    setErrorMessage(null);
    try {
      const imageB64 = await capture();
      const result = await describe({ image_b64: imageB64, mode });
      setDescription(result.description);
      setLatencyMs(result.latency_ms);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(msg);
      setDescription(null);
      setLatencyMs(null);
    } finally {
      setInFlight(false);
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
        onTap={handleTap}
        disabled={status !== 'ready'}
        inFlight={inFlight}
      />

      <ResponseDisplay
        description={description}
        latencyMs={latencyMs}
        errorMessage={errorMessage}
      />
    </main>
  );
}

export default App;
