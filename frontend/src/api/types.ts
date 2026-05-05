// Mirrors backend Pydantic models in backend/src/livesight/inference/server.py.
// If the backend contract changes, this file changes in the same commit.

export type Mode = 'navigate' | 'read' | 'scene';

export interface DescribeRequest {
  image_b64: string;
  mode: Mode;
}

export interface DescribeResponse {
  description: string;
  latency_ms: number;
}

export interface QueryRequest {
  question: string;
  recent_frames_b64?: string[];
}

export interface QueryResponse {
  answer: string;
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
}

export interface HealthResponse {
  status: string;
  model: string;
  adapter_version: string;
}
