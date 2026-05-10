// Static training-history numbers shipped alongside the dashboard.
// Pulled from data-backup/comparisons/ + iteration-log.md so the
// dashboard renders without any backend round-trip for these.
//
// Numbers update by hand when a new adapter is trained; this is fine
// at our scale (3 adapters total to date).

export interface AdapterMetrics {
  version: string;
  trainedOn: number;
  corrections: number;
  finalLoss: number;
  adapterSizeMB: number;
  trainingDate: string;
  status: 'archived' | 'active' | 'fallback';
  note?: string;
}

export const ADAPTER_HISTORY: AdapterMetrics[] = [
  {
    version: 'v0',
    trainedOn: 9,
    corrections: 0,
    finalLoss: 0.061,
    adapterSizeMB: 29,
    trainingDate: '2026-05-06',
    status: 'archived',
    note: 'Pipeline validation. Memorized training set.',
  },
  {
    version: 'v1',
    trainedOn: 25,
    corrections: 5,
    finalLoss: 0.279,
    adapterSizeMB: 29,
    trainingDate: '2026-05-07',
    status: 'fallback',
    note: 'First demo adapter. Hero comparison: Kumon→Kuman.',
  },
  {
    version: 'v1.1',
    trainedOn: 88,
    corrections: 18,
    finalLoss: 0.799,
    adapterSizeMB: 29,
    trainingDate: '2026-05-10',
    status: 'fallback',
    note: 'Outcome C — diluted by larger dataset. Archived.',
  },
  {
    version: 'v1.2',
    trainedOn: 21,
    corrections: 21,
    finalLoss: 0.66,
    adapterSizeMB: 29,
    trainingDate: '2026-05-10',
    status: 'active',
    note: 'Path A — corrections-only. Recovered v1 hero + new RAKtherm word.',
  },
];

// v1's training loss curve (every ~5 steps over 100 max_steps).
// Pulled from train-lora.sh stdout in iteration-log.md — illustrative
// shape rather than exact-stepwise reproduction.
export const V1_LOSS_CURVE: { step: number; loss: number }[] = [
  { step: 5, loss: 0.73 },
  { step: 10, loss: 0.42 },
  { step: 15, loss: 0.31 },
  { step: 20, loss: 0.18 },
  { step: 25, loss: 0.15 },
  { step: 30, loss: 0.12 },
  { step: 35, loss: 0.09 },
  { step: 40, loss: 0.08 },
  { step: 45, loss: 0.1 },
  { step: 50, loss: 0.07 },
  { step: 55, loss: 0.06 },
  { step: 60, loss: 0.08 },
  { step: 65, loss: 0.06 },
  { step: 70, loss: 0.05 },
  { step: 75, loss: 0.07 },
  { step: 80, loss: 0.06 },
  { step: 85, loss: 0.05 },
  { step: 90, loss: 0.06 },
  { step: 95, loss: 0.05 },
  { step: 100, loss: 0.06 },
];

// v1.1 loss curve — extracted from
// /shared-docker/training-runs/v1_1-checkpoints/checkpoint-100/trainer_state.json
// Failed adapter: 88 examples × 4.5 epochs, corrections diluted by ask-mode majority.
export const V1_1_LOSS_CURVE: { step: number; loss: number }[] = [
  { step: 5, loss: 2.3385 },
  { step: 10, loss: 1.2245 },
  { step: 15, loss: 1.2275 },
  { step: 20, loss: 0.9828 },
  { step: 25, loss: 1.0169 },
  { step: 30, loss: 0.875 },
  { step: 35, loss: 0.8105 },
  { step: 40, loss: 0.5819 },
  { step: 45, loss: 0.9385 },
  { step: 50, loss: 0.7051 },
  { step: 55, loss: 0.6597 },
  { step: 60, loss: 0.6585 },
  { step: 65, loss: 0.6081 },
  { step: 70, loss: 0.6404 },
  { step: 75, loss: 0.4597 },
  { step: 80, loss: 0.3538 },
  { step: 85, loss: 0.5244 },
  { step: 90, loss: 0.4409 },
  { step: 95, loss: 0.5438 },
  { step: 100, loss: 0.3905 },
];

// v1.2 loss curve — extracted from
// /shared-docker/training-runs/v1_2-checkpoints/checkpoint-100/trainer_state.json
// Active adapter: 21 corrections × 16.8 epochs, focused training on demo signal.
export const V1_2_LOSS_CURVE: { step: number; loss: number }[] = [
  { step: 5, loss: 2.5127 },
  { step: 10, loss: 2.1172 },
  { step: 15, loss: 1.8267 },
  { step: 20, loss: 0.9767 },
  { step: 25, loss: 1.2085 },
  { step: 30, loss: 0.8238 },
  { step: 35, loss: 0.7643 },
  { step: 40, loss: 0.7214 },
  { step: 45, loss: 0.2536 },
  { step: 50, loss: 0.4294 },
  { step: 55, loss: 0.2749 },
  { step: 60, loss: 0.4176 },
  { step: 65, loss: 0.2333 },
  { step: 70, loss: 0.1816 },
  { step: 75, loss: 0.0711 },
  { step: 80, loss: 0.1239 },
  { step: 85, loss: 0.1013 },
  { step: 90, loss: 0.0516 },
  { step: 95, loss: 0.064 },
  { step: 100, loss: 0.0547 },
];
