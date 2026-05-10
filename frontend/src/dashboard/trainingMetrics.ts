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
