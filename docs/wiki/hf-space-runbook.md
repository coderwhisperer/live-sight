# HF Space Runbook

The Live Sight front-end is deployed as a Hugging Face Static Space:

- **Live URL:** https://friendly-coder-ai-live-sight.static.hf.space
- **Settings page:** https://huggingface.co/spaces/friendly-coder-ai/live-sight
- **Space repo (separate from the main repo):**
  `git@hf.co:spaces/friendly-coder-ai/live-sight` (HTTPS:
  `https://huggingface.co/spaces/friendly-coder-ai/live-sight`)
- **Local clone (laptop):** `~/projects/aa/amd-dev/live-sight-space/`

## How the deployment is wired

The Space is **Static SDK** — it serves whatever files are at the root of
the Space repo as plain HTTP. There is no build step on HF's side; the
React app is pre-built on the laptop and the resulting `dist/` is copied
into the Space repo verbatim.

API calls go from the static page to the droplet's FastAPI **directly**
through the cloudflared tunnel. The tunnel URL is hard-baked into the JS
bundle by Vite at build time via `VITE_API_BASE_URL`. There is no Vite
dev-server proxy in this path — the deployed bundle calls
`https://<tunnel>.trycloudflare.com/describe` etc. cross-origin. CORS on
the FastAPI side allows `*` and includes `PATCH` for the correction-update
endpoint.

```
[ Static Space at hf.space ]
        │  HTTPS, baked-in tunnel URL
        ▼
[ cloudflared quick tunnel ]
        │  HTTP
        ▼
[ FastAPI on droplet :8001 ]   →  vLLM (Qwen3-VL + LoRA) on droplet :8000
```

## When the cloudflared tunnel restarts

Cloudflare quick tunnels (`cloudflared tunnel --url …`) get a **new random
URL every time the process restarts**. The Space's bundle has the old URL
baked in, so it must be rebuilt and redeployed.

```bash
# 1. Note the new tunnel URL — printed by cloudflared on stdout, or read
#    from its metrics endpoint:
curl -s http://127.0.0.1:<metrics-port>/quicktunnel

# 2. Rebuild the front-end with the new URL.
cd ~/projects/aa/amd-dev/live-sight/frontend
VITE_API_BASE_URL=https://<new-tunnel>.trycloudflare.com npm run build
# Verify the URL is in the bundle:
grep -o "https://[a-z-]*\.trycloudflare\.com" dist/assets/index-*.js | sort -u

# 3. Copy dist/ into the Space repo, replacing the previous build's
#    files. The README.md (with the HF frontmatter) is committed inside
#    the Space repo — don't overwrite that.
cd ~/projects/aa/amd-dev/live-sight-space
rm -rf assets index.html favicon.svg logo-*.svg
cp -r ~/projects/aa/amd-dev/live-sight/frontend/dist/. ./

# 4. Commit and push. HF auto-deploys static spaces in ~30-60s.
git add -A
git commit -m "deploy: redeploy with tunnel <short-id>"
git push origin main
```

After push:

```bash
# Confirm the served bundle has the new URL:
curl -s https://friendly-coder-ai-live-sight.static.hf.space/assets/index-*.js \
  | grep -o "https://[a-z-]*\.trycloudflare\.com" | sort -u
```

## For demo day

- **Start the tunnel before the demo and don't restart it.** A fresh
  cloudflared run = fresh URL = redeploy required = 60s of dead Space.
- If you must restart cloudflared mid-demo, run the redeploy procedure
  above; the Space will be down for ~60s while it republishes.
- Keep the laptop that's running cloudflared online for the duration of
  the demo. The tunnel terminates on the droplet's FastAPI; the laptop
  is the cloudflared client.

## Authentication notes

- HF token (write scope on `friendly-coder-ai/live-sight`) lives in
  `/shared-docker/live-sight/.env` on the droplet, mirrored to the
  laptop's `live-sight/.env`. Both are gitignored.
- The Space repo's HTTPS remote includes the token inline in
  `~/projects/aa/amd-dev/live-sight-space/.git/config`. Local-only — not
  committed anywhere.
