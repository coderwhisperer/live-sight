# Task 05 — Doc Cleanup + Logo Assets

## Goal

Reconcile stale references in the root `CLAUDE.md` that contradict
decisions made in tasks 02-04, and drop the project logo SVGs into
`frontend/public/`. Pure laptop work — droplet not needed.

## Why this exists

During tasks 02 and 03, we updated `backend/CLAUDE.md`, `frontend/CLAUDE.md`,
and `docs/architecture.md` to reflect the host-vs-container split and the
FastAPI-on-host decision. The root `CLAUDE.md` was missed and still says
things like "Long-running processes (vLLM, FastAPI) are started with
`docker exec -d`" — which is wrong for FastAPI.

These stale lines are not blocking, but per the project's "docs vs.
conversation" rule, they need to be reconciled before they cause a future
session to make wrong decisions based on outdated context.

## Acceptance criteria

1. Root `CLAUDE.md` has no contradictions with `backend/CLAUDE.md` or
   `docs/architecture.md`.
2. `frontend/public/` contains `logo-icon.svg`, `logo-wordmark.svg`,
   `logo-stacked.svg`.
3. `frontend/public/favicon.svg` is replaced with the icon variant
   (currently the default Vite favicon).
4. `index.html` references the new favicon if its filename changed.
5. README has a logo at the top (use the wordmark, not the icon —
   wordmark is more recognizable in a flat reading context).
6. All committed and pushed.

## Steps

### 1. Identify all stale references in root CLAUDE.md

Open `CLAUDE.md` (root). Look for any reference that contradicts:
- FastAPI runs on the host (not in the container)
- vLLM is started inside the rocm container, not on host
- The repo lives at `/shared-docker/workspace/live-sight/` (or
  `/shared-docker/live-sight/` — confirm which is correct from
  `docs/wiki/setup-state.md`)
- tmux is not used for service lifecycle (Docker handles it)
- Models live at `/shared-docker/models/`, adapters at
  `/shared-docker/adapters/`

Known stale lines (at minimum):
- "Long-running processes (vLLM, FastAPI) are started with `docker exec -d`"
  — FastAPI runs on the host, not via docker exec. Only vLLM is in the
  container.
- The architecture diagram in CLAUDE.md may show "FastAPI inside container"
  if it does, fix it.

Cross-check against `backend/CLAUDE.md` and `docs/architecture.md` —
those are the source of truth for the backend layout.

### 2. Update CLAUDE.md to reflect reality

Make the smallest changes needed to resolve contradictions. Don't rewrite
the whole file — preserve the structure and intent. Specific fixes:

- The "Architecture at a glance" diagram should show the host/container
  split clearly. If it currently lumps both inside the container, fix.
- The "Working on the droplet" section should mention that vLLM uses
  `docker exec -d` but FastAPI uses host nohup (per task 02 decision).
- Anywhere it says "tmux" for service lifecycle, replace with the actual
  pattern (docker exec for vLLM, nohup for FastAPI host service).

After editing, grep your own work:

```bash
grep -n "docker exec -d" CLAUDE.md
grep -n "tmux" CLAUDE.md
grep -n "FastAPI" CLAUDE.md
```

Each result should be either correct (matches reality) or removed.

### 3. Drop the logo SVGs into frontend/public/

The user will provide three SVG files via the conversation:
- `live-sight-icon.svg` (rename to `logo-icon.svg`)
- `live-sight-wordmark.svg` (rename to `logo-wordmark.svg`)
- `live-sight-stacked.svg` (rename to `logo-stacked.svg`)

Put them in `frontend/public/`.

### 4. Replace the favicon

Currently `frontend/public/favicon.svg` is the default Vite logo. Replace
it with a copy of the icon variant:

```bash
cp frontend/public/logo-icon.svg frontend/public/favicon.svg
```

Verify `frontend/index.html` has:

```html
<link rel="icon" type="image/svg+xml" href="/favicon.svg" />
```

If it's pointing at a different filename (e.g., the original Vite
react.svg), update it.

### 5. Add the wordmark to the README

Open `README.md` at repo root. Replace whatever's at the top with:

```markdown
<img src="frontend/public/logo-wordmark.svg" alt="Live Sight" width="380">

A vision assistant that learns you.

Built for the AMD Developer Hackathon, May 2026.

[remaining content as before]
```

The image will render on GitHub. The `width="380"` keeps it from being
huge.

### 6. Verify the frontend still builds

```bash
cd frontend
npm run build
```

Should still succeed. The SVGs are just static assets — they don't affect
the build.

Optionally run `npm run dev` and verify the new favicon shows up in the
browser tab.

### 7. Commit and push

```bash
git add CLAUDE.md frontend/public/ frontend/index.html README.md tasks/05-doc-cleanup-logos.md
git commit -m "docs: reconcile stale CLAUDE.md + add logo assets"
git push origin develop
```

## When you finish

Stop and report. Tell the user what stale lines you found and how you
fixed them. If you found other contradictions beyond the ones called out
above, list them — that's useful context for future task sessions.

Next: task 06 (mode-aware prompts on the backend). Requires droplet.

## If something fails

- Logo SVGs render but look wrong in the README: GitHub doesn't always
  render SVGs at requested width. If broken, embed the wordmark as a
  PNG export instead. Not blocking.
- Favicon doesn't update in browser: hard refresh (Ctrl+Shift+R). Browsers
  cache favicons aggressively.
- npm run build fails after the changes: revert the SVG changes (they
  shouldn't affect the build) and investigate. Most likely cause is
  accidental edit to vite.config.ts.

If something fails not on this list: stop, ask the user.
