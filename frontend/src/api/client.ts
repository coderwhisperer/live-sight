import type {
  DescribeRequest,
  DescribeResponse,
  HealthResponse,
  InteractionLogRequest,
  QueryRequest,
  QueryResponse,
  TranscribeResponse,
} from './types';

const API_BASE: string =
  import.meta.env.VITE_API_BASE_URL ?? '/api' ; //'http://localhost:3001';

async function postJSON<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${path} failed: ${res.status}`);
  }
  return res.json() as Promise<TRes>;
}

export function describe(req: DescribeRequest): Promise<DescribeResponse> {
  return postJSON('/describe', req);
}

export function query(req: QueryRequest): Promise<QueryResponse> {
  return postJSON('/query', req);
}

export async function interactionLog(
  req: InteractionLogRequest,
): Promise<{ id: string }> {
  const res = await postJSON<InteractionLogRequest, Record<string, unknown>>(
    '/interaction-log',
    req,
  );
  if (res && typeof res.id === 'string') return { id: res.id };
  // Pre-task-13 backends returned only { logged: true }. Fall back to a
  // client-generated UUID so the UI can still mount the correction UI;
  // the PATCH will 404 on this fake id and the user will see the error,
  // which is the right signal that the backend needs a redeploy.
  return { id: crypto.randomUUID() };
}

export async function interactionUpdate(
  id: string,
  correction: string,
): Promise<void> {
  const res = await fetch(`${API_BASE}/interaction-log/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_correction: correction }),
  });
  if (!res.ok) {
    throw new Error(`interaction-log PATCH failed: ${res.status}`);
  }
}

export async function transcribeAudio(
  audioBlob: Blob,
): Promise<TranscribeResponse> {
  const formData = new FormData();
  formData.append('audio', audioBlob, 'recording.webm');
  const res = await fetch(`${API_BASE}/transcribe`, {
    method: 'POST',
    body: formData,
  });
  const data = (await res.json()) as TranscribeResponse & { error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `transcribe failed: ${res.status}`);
  }
  return data;
}

export async function health(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`/health failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export { API_BASE };
