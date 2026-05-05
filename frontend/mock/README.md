# Mock Backend

Run with `npm run mock` from the `frontend/` directory.

Listens on `http://localhost:3001` and mimics the FastAPI contract from
`docs/architecture.md`. Used during local development when the AMD droplet
is destroyed.

NOT for production. Not deployed to the HF Space.

## Switching the frontend between mock and real backend

Edit `frontend/.env.local`:

```
# Mock (this server)
VITE_API_BASE_URL=http://localhost:3001

# Real droplet backend
VITE_API_BASE_URL=http://<droplet-ip>:8001
```

Restart `npm run dev` after changing `.env.local`.

## Endpoints

All shapes match `backend/src/livesight/inference/server.py`.

- `GET  /health` → `{ status, model, adapter_version }`
- `POST /describe` `{ image_b64, mode }` → `{ description, latency_ms }`
- `POST /query` `{ question, recent_frames_b64 }` → `{ answer, latency_ms }`
- `POST /interaction-log` → `{ logged: true }`

`/describe` echoes the mode in the response (`[mock:scene] ...`) so you
can verify the mode toggle wires through correctly.
