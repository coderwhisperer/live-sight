import { useCallback, useEffect, useRef, useState } from 'react';

const MAX_DIM = 768;
const JPEG_QUALITY = 0.85;

type Status = 'idle' | 'requesting' | 'ready' | 'denied' | 'error';

export interface UseCameraResult {
  status: Status;
  error: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  capture: () => Promise<string>;
}

export function useCamera(): UseCameraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setStatus('requesting');
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStatus('ready');
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const name = err instanceof DOMException ? err.name : 'UnknownError';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setStatus('denied');
          setError('Camera permission denied');
        } else {
          setStatus('error');
          setError(err instanceof Error ? err.message : String(err));
        }
      });

    return () => {
      cancelled = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
  }, []);

  const capture = useCallback(async (): Promise<string> => {
    const video = videoRef.current;
    if (!video || video.readyState < 2) {
      throw new Error('Camera not ready');
    }
    const w = video.videoWidth;
    const h = video.videoHeight;
    const longest = Math.max(w, h);
    const scale = longest > MAX_DIM ? MAX_DIM / longest : 1;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
    // Strip the "data:image/jpeg;base64," prefix — backend wants raw b64.
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  }, []);

  return { status, error, videoRef, capture };
}
