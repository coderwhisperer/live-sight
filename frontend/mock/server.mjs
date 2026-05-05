import express from 'express';
import cors from 'cors';
import responses from './responses.json' with { type: 'json' };

const app = express();
const PORT = 3001;

app.use(cors({ origin: 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

const startedAt = Date.now();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const pickResponse = (mode) => {
  const pool = responses[mode] || responses.scene;
  return pool[Math.floor(Math.random() * pool.length)];
};

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    model: 'mock-qwen2-vl',
    adapter_version: 'mock-v0',
  });
});

app.post('/describe', async (req, res) => {
  const { image_b64, mode } = req.body;
  if (!image_b64 || !mode) {
    return res.status(400).json({ error: 'missing fields' });
  }

  const start = Date.now();
  await sleep(350 + Math.random() * 150);
  const description = `[mock:${mode}] ${pickResponse(mode)}`;
  res.json({
    description,
    latency_ms: Date.now() - start,
  });
});

app.post('/query', async (req, res) => {
  const { question, recent_frames_b64 } = req.body;
  if (!question) return res.status(400).json({ error: 'missing question' });
  if (!recent_frames_b64?.length) {
    return res.status(400).json({ error: 'need at least one frame' });
  }

  const start = Date.now();
  await sleep(200 + Math.random() * 100);
  res.json({
    answer: `[mock] In response to "${question}": this is a simulated answer about what's in the frame.`,
    latency_ms: Date.now() - start,
  });
});

app.post('/interaction-log', (req, res) => {
  // No-op in mock. Real backend writes JSONL.
  res.json({ logged: true });
});

app.listen(PORT, () => {
  console.log(`Mock backend running on http://localhost:${PORT}`);
  console.log(`Started at ${new Date(startedAt).toISOString()}`);
  console.log(`Health: http://localhost:${PORT}/health`);
});
