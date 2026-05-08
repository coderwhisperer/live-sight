// Mirrors backend Pydantic models in backend/src/livesight/inference/server.py.
// If the backend contract changes, this file changes in the same commit.

export type Mode = 'navigate' | 'read' | 'scene' | 'ask';

export interface DescribeRequest {
  image_b64: string;
  mode: Mode;
}

export interface DescribeResponse {
  description: string;
  latency_ms: number;
}

export interface QueryRequest {
  image_b64: string;
  question: string;
}

export interface QueryResponse {
  response: string;
  latency_ms: number;
  // id of the auto-logged interaction-log row; null when the in-process
  // log write fails on the backend (rare). Frontend uses this for the
  // CorrectionUI PATCH; falls back to a client UUID if null.
  id?: string | null;
}

export interface RecallRequest {
  image_b64: string;
  question: string;
}

export interface RecallResponse {
  response: string;
  latency_ms: number;
  id?: string | null;
  retrieved?: {
    matched_id?: string;
    matched_mode?: string;
    matched_response_excerpt?: string;
    similarity?: number;
  } | null;
}

export interface InteractionLogRequest {
  image_b64: string;
  mode: Mode;
  response: string;
  user_correction?: string;
}

export interface InteractionLogResponse {
  logged: boolean;
  id: string;
}

export interface CorrectionUpdateResponse {
  ok: boolean;
  id: string;
}

export interface TranscribeResponse {
  transcript: string;
  language?: string;
  duration_s?: number;
}

export interface HealthResponse {
  status: string;
  model: string;
  adapter_version: string;
}
