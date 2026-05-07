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
