# Frontend — React on Hugging Face Space

## Environment

- TypeScript 5.x strict mode
- React 18, Vite, Tailwind CSS, shadcn/ui
- Deployed as a static Hugging Face Space (the React variant, not Gradio)
- The Space calls our AMD droplet backend at `https://<droplet-ip>:8001`

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
