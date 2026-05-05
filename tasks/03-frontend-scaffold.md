# Task 03 — Frontend Scaffold (Vite + React + Tailwind)

## Goal

Stand up the Live Sight web frontend on the user's laptop, with the
ability to develop entirely against a local mock backend. By end of task,
the user can run `npm run dev`, open `http://localhost:5173`, see the
camera-tap UI, and exercise the full describe → speak loop using mocked
responses.

This task is laptop-side only. The AMD droplet is destroyed and stays
destroyed — frontend development doesn't need it.

## Why this sequencing

The original plan had task 03 as backend mode-aware prompts. We're
swapping order because:

1. The droplet costs $1.99/hr and the user is mid-break. Frontend work
   doesn't need it.
2. The frontend can be 80% built against a mock backend. Once the
   droplet is back, we wire it in.
3. Mode-aware prompts (the deferred task 03) are small (~1 hour) and
   can slot in during a brief droplet session later.

## Acceptance criteria

1. Vite + React 18 + TypeScript strict + Tailwind 3 project scaffolded
   in `frontend/`.
2. shadcn/ui set up (init only — components added on demand later).
3. App renders three core components: `CameraButton`, `ModeToggle`,
   `ResponseDisplay`.
4. `VITE_API_BASE_URL` environment variable controls backend target.
   Defaults to `http://localhost:3001` (the mock). Switching to the
   droplet IP later is a one-line `.env.local` change.
5. The full happy path works against the mock: tap camera → image
   captured → POST to `/describe` → response displayed → spoken via
   Web Speech API.
6. Mode toggle (navigate / read / scene) updates the UI and is included
   in the API call. The mock echoes the mode back so we can verify.
7. `npm run dev` works, `npm run build` produces a dist/, no TS errors,
   no console errors on the happy path.
8. Frontend is gitignored correctly: `node_modules/`, `dist/`,
   `.env.local` not committed.

## Not in scope (defer)

- Real camera permissions UX polish (denied permission flow, etc.) —
  task 05.
- Actual ElevenLabs TTS — Web Speech API is sufficient for this task.
  ElevenLabs comes in for the demo recording on Day 5-6.
- HF Space deployment — task 07.
- Authentication — single-user demo, defer to pre-submission.
- Conversational memory across queries (the "did I already ask about
  this" feature) — task 06 once LoRA is in.

## Steps

### 1. Verify the local environment

Check Node and npm versions:

```bash
node --version    # need 18+, prefer 20 LTS
npm --version     # need 10+
```

If Node is older, the user installs nvm and pulls a current version
before continuing. Don't try to scaffold against Node 16.

### 2. Scaffold Vite + React + TypeScript

From the repo root on the laptop:

```bash
cd frontend
npm create vite@latest . -- --template react-ts
```

When Vite asks "remove existing files?" answer yes (the existing
CLAUDE.md is preserved by git, will be re-added). Then:

```bash
npm install
```

Verify a clean dev server starts:

```bash
npm run dev
# Should serve on http://localhost:5173
```

Kill the dev server (Ctrl+C) before continuing.

### 3. Add Tailwind CSS

```bash
npm install -D tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

Configure `tailwind.config.js`:

```js
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: { extend: {} },
  plugins: [],
};
```

Replace `src/index.css` with:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Reset some Vite defaults that fight Tailwind */
:root {
  color-scheme: light dark;
}
body {
  margin: 0;
  min-height: 100vh;
}
```

Verify Tailwind classes work — temporary test in App.tsx:

```tsx
<div className="bg-blue-500 text-white p-8 text-2xl">
  Tailwind works
</div>
```

If you see a blue box with white text, kill it. If not, debug before
continuing.

### 4. Initialize shadcn/ui

```bash
npx shadcn@latest init
```

Choose: TypeScript yes, default style, slate base color, CSS variables
yes, src/components/ui as the components directory, src/lib/utils.ts
for utilities.

This creates `src/components/ui/` (empty for now) and `src/lib/utils.ts`
with the `cn()` className helper.

Don't pre-install components — add them on demand as you need them.

### 5. Project layout

After scaffolding, restructure to match the architecture:

```
frontend/
├── CLAUDE.md                    # already exists, leave it
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
├── index.html
├── .env.example                 # commit this
├── .env.local                   # gitignored, user creates from example
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── components/
│   │   ├── CameraButton.tsx
│   │   ├── ModeToggle.tsx
│   │   ├── ResponseDisplay.tsx
│   │   └── ui/                  # shadcn lives here
│   ├── api/
│   │   ├── client.ts            # fetch wrappers, reads VITE_API_BASE_URL
│   │   └── types.ts             # mirrors backend Pydantic models
│   ├── hooks/
│   │   ├── useCamera.ts         # getUserMedia
│   │   └── useTTS.ts            # Web Speech wrapper
│   ├── lib/
│   │   └── utils.ts             # shadcn's cn()
│   └── styles/
│       └── tokens.css           # design tokens (defer details to task 05)
└── public/
```

### 6. The API client (`src/api/client.ts`)

Reads `import.meta.env.VITE_API_BASE_URL`. Defaults to
`http://localhost:3001` if unset (the mock). Exposes async functions
matching the backend contract:

```typescript
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001';

export async function describe(imageB64: string, mode: Mode): Promise<DescribeResponse> {
  const res = await fetch(`${API_BASE}/describe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_b64: imageB64, mode }),
  });
  if (!res.ok) throw new Error(`describe failed: ${res.status}`);
  return res.json();
}

// Similar wrappers for query, interactionLog, health
```

Types in `src/api/types.ts` mirror the backend Pydantic models exactly.
If the backend contract changes, this file changes too.

### 7. The components

**CameraButton** (`src/components/CameraButton.tsx`):
- One large round tap target, accessible (ARIA label "Capture and describe")
- On tap: invokes useCamera hook to capture a frame, then calls
  describe(), then passes result to parent
- Visual feedback: disabled+pulsing while in flight
- Touch-friendly minimum size (88px diameter or larger)

**ModeToggle** (`src/components/ModeToggle.tsx`):
- Three labeled buttons in a row: Navigate, Read, Scene
- Currently selected mode is visually distinct (filled vs outlined)
- Stores selection in parent state, defaults to "scene"

**ResponseDisplay** (`src/components/ResponseDisplay.tsx`):
- Shows the latest description as text
- ARIA live region so screen readers announce updates
- Calls useTTS hook to speak the description aloud automatically

**App.tsx** orchestrates: holds mode state, holds latest response
state, wires the components together.

### 8. The hooks

**useCamera** (`src/hooks/useCamera.ts`):
- Wraps `navigator.mediaDevices.getUserMedia({ video: true })`
- Captures a still frame to a hidden canvas, returns base64 JPEG
- Resizes to max 768px on the longest dimension before encoding
  (defense in depth — backend also resizes, but client-side resize
  saves upload bandwidth and improves latency)
- Handles permission errors gracefully

**useTTS** (`src/hooks/useTTS.ts`):
- Wraps `window.speechSynthesis`
- `speak(text)` cancels any in-progress speech and starts new
- Handles missing browser support (older Safari) by returning a no-op
- No external API calls — Web Speech is free, instant, and offline

### 9. Mock backend mode

This task does NOT include building the mock. That's task 04.
However, the frontend needs to *expect* one. So:

- Document in `frontend/CLAUDE.md` that local dev assumes a mock at
  `localhost:3001` (task 04 builds it)
- Create `.env.example` with `VITE_API_BASE_URL=http://localhost:3001`
- The user creates `.env.local` from `.env.example`

For now, the dev server will fail API calls — that's expected. Confirm
the UI renders and the click path *attempts* the call (you can see the
fetch in browser dev tools, failing with CORS or connection refused).

### 10. Build verification

```bash
npm run build
```

Should produce `dist/` with no TS errors. If TS strict mode complains
about something, fix it — don't loosen the strict settings.

```bash
npm run preview
```

Opens the production build at `http://localhost:4173`. Verify the UI
still renders.

### 11. Update gitignore

Append to root `.gitignore`:

```
# Frontend
frontend/node_modules/
frontend/dist/
frontend/.env.local
frontend/.vite/
```

(The Node entries should already be there from the initial scaffold,
but confirm.)

### 12. Commit

```bash
git add frontend/ tasks/03-frontend-scaffold.md .gitignore
git commit -m "feat(frontend): scaffold Vite + React + Tailwind + shadcn"
git push origin develop
```

## When you finish

Stop and report. Tell the user:
- The dev server URL
- That API calls will fail until task 04 (mock backend) is done
- Any deviations from the spec (TS errors that needed addressing,
  Tailwind class conflicts, etc.)

Next task: 04-frontend-mock-backend.

## If something fails

- `npm create vite` complains about non-empty directory: this is
  expected. Answer yes to remove existing files. The `frontend/CLAUDE.md`
  is preserved by git and will reappear after the scaffold.
- Tailwind classes have no effect: check `content` paths in
  `tailwind.config.js` match where your TSX files actually are.
- shadcn init fails: usually a Node version issue. Run with Node 20.
- Browser camera permission prompt doesn't appear: HTTPS or localhost
  is required for getUserMedia. localhost works; 127.0.0.1 also works;
  bare IPs from the LAN do not.

If something fails not on this list: stop, don't improvise, ask the user.
