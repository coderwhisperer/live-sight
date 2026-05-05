import type {
  DescribeRequest,
  DescribeResponse,
  HealthResponse,
  InteractionLogRequest,
  InteractionLogResponse,
  QueryRequest,
  QueryResponse,
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

export function interactionLog(
  req: InteractionLogRequest,
): Promise<InteractionLogResponse> {
  return postJSON('/interaction-log', req);
}

export async function health(): Promise<HealthResponse> {
  const res = await fetch(`${API_BASE}/health`);
  if (!res.ok) throw new Error(`/health failed: ${res.status}`);
  return res.json() as Promise<HealthResponse>;
}

export { API_BASE };
