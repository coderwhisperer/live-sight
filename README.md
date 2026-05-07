<img src="frontend/public/logo-wordmark.svg" alt="Live Sight" width="380">

A vision assistant that learns you.

Built for the AMD Developer Hackathon, May 2026.

## Try it live

**Live demo:** https://friendly-coder-ai-live-sight.static.hf.space

Phone recommended (uses camera). Best in Chrome on Android or Safari on iOS.

The static front-end is hosted on Hugging Face Spaces; it talks to the
Qwen3-VL-8B backend running on an AMD MI300X droplet over a cloudflared
tunnel. The tunnel URL is baked into the front-end bundle at build time —
see [docs/wiki/hf-space-runbook.md](docs/wiki/hf-space-runbook.md) for
the redeploy procedure when the tunnel rotates.

## Status

In development. Demo coming soon.

---

*Full README will be written closer to demo day. See `docs/` for current
project state.*
