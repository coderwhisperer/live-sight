# Task 04 — Local Mock Backend

## Goal

A small Node/Express server on the user's laptop that mimics the FastAPI
contract from `docs/architecture.md`. Lets the frontend (task 03) be
developed and exercised end-to-end without the AMD droplet running.

## Why this exists

The droplet is destroyed when not actively building. Frontend dev would
otherwise either (a) require the droplet to always be up at $1.99/hr
or (b) leave the API calls broken in dev. A 50-line mock solves it.

The mock is *not* shipped to production. It lives in `frontend/mock/`,
runs only on localhost, and is gitignored from the deployment artifact.

## Acceptance criteria

1. Mock server runs on `http://localhost:3001`.
2. Implements all four endpoints with the same JSON shapes as the real
   backend: `/describe`, `/query`, `/interaction-log`, `/health`.
3. Returns realistic-looking responses with simulated latency (~400ms
   for /describe, similar to the real backend).
4. Echoes back the `mode` field so the frontend can verify mode-aware
   wiring works.
5. CORS allows `http://localhost:5173` (Vite dev server).
6. Started via `npm run mock` from `frontend/` directory.
7. Frontend's happy path works against the mock: tap → describe → speak.

## Steps

### 1. Create the mock structure

```
frontend/mock/
├── server.mjs        # the Express server
├── responses.json    # canned descriptions for variety
└── README.md         # how to run it
```

### 2. Install Express as a dev dependency

```bash
cd frontend
npm install --save-dev express cors
```

### 3. Write the mock server (`mock/server.mjs`)

```javascript
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
  if (!image_b64 || !mode) return res.status(400).json({ error: 'missing fields' });

  const start = Date.now();
  await sleep(350 + Math.random() * 150);  // 350-500ms simulated
  const description = `[mock:${mode}] ${pickResponse(mode)}`;
  res.json({
    description,
    latency_ms: Date.now() - start,
  });
});

app.post('/query', async (req, res) => {
  const { question, recent_frames_b64 } = req.body;
  if (!question) return res.status(400).json({ error: 'missing question' });
  if (!recent_frames_b64?.length) return res.status(400).json({ error: 'need at least one frame' });

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
```

### 4. Canned responses (`mock/responses.json`)

```json
{
  "navigate": [
    "A clear path ahead for about three meters. Doorway on the left side.",
    "Open kitchen space. Counter to your right at hip height. Step down in two paces.",
    "Sidewalk continues straight. Curb cut on the right edge."
  ],
  "read": [
    "Sign reads: 'Please ring bell for service.' Below in smaller text: 'Hours 9 to 5.'",
    "Document title: 'Quarterly Report.' Date appears to be March 2026.",
    "Menu item: Chicken biryani, 850 rupees. Vegetable korma, 600 rupees."
  ],
  "scene": [
    "A bright kitchen in afternoon light. Wooden countertop with a basket of tomatoes and a folded newspaper.",
    "Living room with a soft couch, two cushions, a small bookshelf to the left of a lamp.",
    "Outdoor courtyard, brick paving, trees casting dappled shadows. A few people walking past."
  ]
}
```

### 5. Add npm script

In `frontend/package.json`, add to scripts:

```json
"scripts": {
  "dev": "vite",
  "build": "tsc && vite build",
  "preview": "vite preview",
  "mock": "node mock/server.mjs"
}
```

### 6. Update `frontend/mock/README.md`

```markdown
# Mock Backend

Run with `npm run mock` from the frontend directory.

Listens on http://localhost:3001 and mimics the FastAPI contract.
Used during local development when the AMD droplet is destroyed.

NOT for production. Not deployed to the HF Space.

To switch the frontend between mock and real backend:

  # .env.local
  VITE_API_BASE_URL=http://localhost:3001       # mock
  VITE_API_BASE_URL=http://<droplet-ip>:8001    # real

After changing .env.local, restart `npm run dev`.
```

### 7. Run both side by side and verify

In two terminal windows from `frontend/`:

```bash
# Terminal 1
npm run mock

# Terminal 2
npm run dev
```

Open `http://localhost:5173`. Tap the camera button. Verify:
- Browser asks for camera permission (allow it)
- After tap, network tab shows POST to localhost:3001/describe
- Response comes back with `[mock:scene] ...` prefix
- ResponseDisplay shows the text
- Web Speech API speaks it aloud (system volume on)
- Mode toggle changes the prefix (`[mock:navigate]` etc.)

### 8. Update gitignore

The mock should be committed (it's a dev tool). The `node_modules/`
already covers Express. Verify nothing extra needs ignoring.

### 9. Commit

```bash
git add frontend/mock/ frontend/package.json
git commit -m "feat(frontend): local mock backend for offline dev"
git push origin develop
```

## When you finish

Stop and report. Tell the user:
- The dev workflow: two terminals, `npm run mock` + `npm run dev`
- That switching to the real backend is one `.env.local` line change
- Any rough edges (e.g., responses feel too random — adjust later)

Next task: 05-frontend-polish (visual design, accessibility audit) or
back to backend (mode-aware prompts) once the droplet is up again.

## If something fails

- Express import fails on `with { type: 'json' }`: this is Node 20.10+
  syntax. Either upgrade Node or change the import to a fs.readFileSync
  fallback.
- CORS errors in browser: the `cors({ origin: 'http://localhost:5173' })`
  must include the trailing port. If Vite picked a different port (5174,
  etc.), update the mock or set `--port 5173` in vite.config.ts.
- Camera doesn't activate: localhost is required for getUserMedia.
  127.0.0.1 also works. LAN IPs do not without HTTPS.

If something fails not on this list: stop, don't improvise, ask the user.
