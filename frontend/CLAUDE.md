# Frontend — React on Hugging Face Space

## Environment

- TypeScript 5+ strict mode (currently TS 6 via `create-vite` @latest)
- React 18+ (currently React 19), Vite 8, Tailwind 3, shadcn/ui
- Deployed as a static Hugging Face Space (the React variant, not Gradio)
- The Space calls our AMD droplet backend at `https://<droplet-ip>:8001`

## Local development

The droplet may be destroyed when not actively in use. For laptop dev
without it, the frontend points at a local mock backend on
`http://localhost:3001` (see `mock/` and task 04). Switch targets via
`.env.local`:

```
VITE_API_BASE_URL=http://localhost:3001       # mock
VITE_API_BASE_URL=http://<droplet-ip>:8001    # real backend
```

## Layout

```
frontend/
├── package.json
├── vite.config.ts
├── tailwind.config.js
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── components/
│   │   ├── CameraButton.tsx     # the one big tap target
│   │   ├── ModeToggle.tsx       # navigate / read / scene
│   │   └── ResponseDisplay.tsx  # text + TTS playback
│   ├── api/
│   │   └── client.ts            # fetch wrappers for backend
│   ├── hooks/
│   │   ├── useCamera.ts         # getUserMedia
│   │   └── useTTS.ts            # ElevenLabs or Web Speech
│   └── styles/
│       └── tokens.css           # design tokens
└── public/
```

## Design principles

- **One big button**: the camera tap target is the only thing that matters
  on the home screen. Make it obvious, large, and high-contrast.
- **Voice-first**: every user-facing string also gets read aloud via TTS.
- **Accessible by default**: ARIA labels everywhere, focus management,
  no color-only signals.
- **Mode toggle**: 3 buttons (navigate / read / scene), not a dropdown.

## TTS strategy

Two-tier:

1. **Browser Web Speech API** for fast, free, offline-capable speech.
2. **ElevenLabs** for the demo recording (warmer voice). Falls back to
   Web Speech if API key not set.

Prefer Web Speech for the live HF Space — no API costs, instant playback.

## What to defer

- User accounts
- Multiple languages in UI (Phase 2)
- Settings / preferences
- History / past interactions list
