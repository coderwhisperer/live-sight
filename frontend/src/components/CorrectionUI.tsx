import { useEffect, useRef, useState } from 'react';
import { interactionUpdate, transcribeAudio } from '@/api/client';
import { cn } from '@/lib/utils';

type Mode =
  | 'prompt'
  | 'editing'
  | 'recording'
  | 'transcribing'
  | 'saving'
  | 'saved'
  | 'error';

interface CorrectionUIProps {
  originalResponse: string;
  interactionId: string | null;
  onClose?: () => void;
}

export function CorrectionUI({
  originalResponse,
  interactionId,
  onClose,
}: CorrectionUIProps) {
  const [mode, setMode] = useState<Mode>('prompt');
  const [correctionText, setCorrectionText] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Stop a live recording if the component unmounts mid-flight (e.g. user
  // taps the camera again before they release the mic). Without this the
  // mic LED stays on and the stream tracks leak.
  useEffect(() => {
    return () => {
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== 'inactive') {
        recorder.stop();
        recorder.stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // Auto-dismiss after a successful save so the user can keep going.
  useEffect(() => {
    if (mode !== 'saved') return;
    const t = setTimeout(() => onClose?.(), 3000);
    return () => clearTimeout(t);
  }, [mode, onClose]);

  async function startRecording() {
    if (mode === 'transcribing' || mode === 'saving') return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      audioChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setMode('recording');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Microphone access required: ${msg}`);
      setMode('error');
    }
  }

  async function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    await new Promise<void>((resolve) => {
      recorder.onstop = () => resolve();
      recorder.stop();
    });
    recorder.stream.getTracks().forEach((t) => t.stop());

    setMode('transcribing');
    try {
      const audioBlob = new Blob(audioChunksRef.current, {
        type: 'audio/webm',
      });
      const { transcript } = await transcribeAudio(audioBlob);
      setCorrectionText(transcript);
      setMode('editing');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Transcription failed: ${msg}`);
      setMode('error');
    }
  }

  async function saveCorrection() {
    if (!interactionId) {
      setErrorMessage('No interaction to update');
      setMode('error');
      return;
    }
    if (!correctionText.trim()) {
      setErrorMessage('Correction is empty');
      setMode('error');
      return;
    }
    setMode('saving');
    try {
      await interactionUpdate(interactionId, correctionText);
      setMode('saved');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setErrorMessage(`Save failed: ${msg}`);
      setMode('error');
    }
  }

  function startEditing() {
    setCorrectionText(originalResponse);
    setErrorMessage(null);
    setMode('editing');
  }

  function cancelEditing() {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.stop();
      recorder.stream.getTracks().forEach((t) => t.stop());
    }
    setCorrectionText('');
    setErrorMessage(null);
    setMode('prompt');
  }

  // ──────────────────────────── render ────────────────────────────

  if (mode === 'prompt') {
    return (
      <div
        role="region"
        aria-label="Correct this response"
        className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
      >
        <p className="mb-3 text-base text-slate-700">Was this accurate?</p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setMode('saved')}
            className="rounded-md border-2 border-blue-600 bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            ✓ Looks good
          </button>
          <button
            type="button"
            onClick={startEditing}
            className="rounded-md border-2 border-blue-600 bg-transparent px-4 py-2 text-base font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
          >
            ✏ Add correction
          </button>
        </div>
      </div>
    );
  }

  if (mode === 'saved') {
    return (
      <div
        role="status"
        aria-live="polite"
        className="w-full max-w-2xl rounded-lg border border-green-200 bg-green-50 p-3 text-base text-green-800"
      >
        ✓ Correction saved.
      </div>
    );
  }

  // editing / recording / transcribing / saving / error all share the editor frame
  const recording = mode === 'recording';
  const transcribing = mode === 'transcribing';
  const saving = mode === 'saving';
  const errored = mode === 'error';

  const editorDisabled = transcribing || saving;
  const micDisabled = transcribing || saving;
  const saveDisabled = transcribing || saving || recording;

  return (
    <div
      role="region"
      aria-label="Edit correction"
      className="w-full max-w-2xl rounded-lg border border-slate-200 bg-white p-5 shadow-sm"
    >
      <label
        htmlFor="correction-textarea"
        className="mb-2 block text-base font-medium text-slate-800"
      >
        Edit the response
      </label>
      <textarea
        id="correction-textarea"
        value={correctionText}
        onChange={(e) => setCorrectionText(e.target.value)}
        disabled={editorDisabled}
        rows={5}
        className="w-full rounded-md border border-slate-300 bg-white p-3 text-base leading-relaxed text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:bg-slate-50"
      />

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={micDisabled}
          aria-pressed={recording}
          aria-label={recording ? 'Recording — release to transcribe' : 'Hold to speak'}
          className={cn(
            'rounded-md border-2 px-4 py-2 text-base font-medium select-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60',
            recording
              ? 'animate-pulse border-red-600 bg-red-600 text-white'
              : 'border-blue-600 bg-transparent text-blue-700 hover:bg-blue-50',
          )}
        >
          {recording ? '🔴 Recording…' : transcribing ? 'Transcribing…' : '🎤 Hold to speak'}
        </button>

        <button
          type="button"
          onClick={saveCorrection}
          disabled={saveDisabled}
          className="rounded-md border-2 border-blue-600 bg-blue-600 px-4 py-2 text-base font-medium text-white hover:bg-blue-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save correction'}
        </button>

        <button
          type="button"
          onClick={cancelEditing}
          className="rounded-md border-2 border-slate-300 bg-transparent px-4 py-2 text-base font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Cancel
        </button>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={cn('mt-2 min-h-5 text-sm', errored ? 'text-red-700' : 'text-slate-500')}
      >
        {errored
          ? errorMessage
          : recording
            ? 'Recording — release the button to transcribe.'
            : transcribing
              ? 'Sending audio for transcription (5–10s)…'
              : ''}
      </p>

      {errored && (
        <button
          type="button"
          onClick={() => {
            setErrorMessage(null);
            setMode('editing');
          }}
          className="mt-2 rounded-md border-2 border-blue-600 bg-transparent px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500"
        >
          Try again
        </button>
      )}
    </div>
  );
}
