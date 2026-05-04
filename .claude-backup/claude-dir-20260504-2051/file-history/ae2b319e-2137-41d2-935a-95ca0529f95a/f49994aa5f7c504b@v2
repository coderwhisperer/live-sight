# Task 01 — Droplet Provision + vLLM Smoke Test

## Goal

Get the AMD MI300X host droplet running the `rocm` Docker container with
vLLM serving Qwen2-VL-7B, and pass a smoke test from the host. Wall-clock
target: under 60 minutes from droplet creation.

## How this differs from a "bare" vLLM install

vLLM does **not** run on the host. It runs inside Docker container `rocm`,
which the AMD image starts at boot. `/shared-docker` is bind-mounted into
the container at the same path, so paths in commands look identical whether
they're run on the host or inside the container.

```
host                                 container `rocm`
/shared-docker/live-sight/   <--->   /shared-docker/live-sight/
/shared-docker/models/       <--->   /shared-docker/models/
/shared-docker/logs/         <--->   /shared-docker/logs/
```

vLLM is started with `docker exec -d rocm …`, logging to
`/shared-docker/logs/vllm.log`. That replaces the role tmux played in the
old "bare host" plan: the process is owned by the docker daemon, so it
survives SSH disconnects and the host shell exiting. Host-level tmux is
not required for this task; reach for it later only if you want to babysit
multiple foreground commands in one session.

## Acceptance criteria

1. Host droplet provisioned, SSH key working.
2. Docker container `rocm` running with ports 8000/8888/30000 published.
3. Repo cloned to `/shared-docker/live-sight/`.
4. `/shared-docker/live-sight/.env` exists with `HF_TOKEN` set.
5. Qwen2-VL-7B downloaded to `/shared-docker/models/qwen2-vl-7b/`.
6. vLLM serving on container port 8000, reachable from host on 8000.
7. `backend/scripts/smoke-test.sh` (run from host) returns a description.
8. `docs/wiki/setup-state.md` updated.

## Steps

### 1. Provision the host (user, manual via web console)

- GPU plan: MI300X (1 GPU)
- Image: AMD's ROCm image that ships the `rocm` Docker container
- SSH key: select yours
- Click Create

Wait ~3 minutes. Note the IP.

### 2. SSH in and confirm container

```bash
ssh root@<droplet-ip>
docker ps                       # expect container `rocm`, ports 8000/8888/30000
```

### 3. Verify container's GPU + vLLM

```bash
docker exec rocm rocm-smi
docker exec rocm vllm --version
```

Expected: 1 MI300X with 192GB shown by `rocm-smi`; `vllm --version`
prints `0.17.1+rocm700` (a startup warning about
`legacy triton_kernels on ROCm` is normal, ignore it).

If either fails, destroy the host and recreate.

### 4. Clone repo and install Claude Code on the host

```bash
mkdir -p /shared-docker
cd /shared-docker
git clone https://github.com/coderwhisperer/live-sight.git
cd live-sight

curl -fsSL https://claude.ai/install.sh | bash
```

Sign in to Claude Code with your account.

### 5. Set environment variables

```bash
cat > /shared-docker/live-sight/.env <<EOF
HF_TOKEN=<your-hf-token>
ELEVENLABS_API_KEY=<optional>
EOF
chmod 600 /shared-docker/live-sight/.env
```

### 6. Download Qwen2-VL-7B (run inside container)

The container already has `huggingface-cli`. Run the download from inside
it so the cache lands in container-friendly paths, but write the model to
the bind-mounted `/shared-docker/models/` so it survives container restarts.

```bash
mkdir -p /shared-docker/models /shared-docker/logs

docker exec rocm bash -c '
  set -euo pipefail
  export HF_TOKEN=$(grep ^HF_TOKEN /shared-docker/live-sight/.env | cut -d= -f2-)
  huggingface-cli download Qwen/Qwen2-VL-7B-Instruct \
    --local-dir /shared-docker/models/qwen2-vl-7b \
    --token "$HF_TOKEN"
'
```

Expected: ~16GB, 5-15 minutes.

### 7. Start vLLM (detached, inside container)

```bash
docker exec -d rocm bash -c '
  HIP_VISIBLE_DEVICES=0 \
  PYTORCH_ALLOC_CONF=expandable_segments:True \
  vllm serve /shared-docker/models/qwen2-vl-7b \
    --served-model-name qwen2-vl \
    --port 8000 \
    --max-model-len 4096 \
    --dtype bfloat16 \
    > /shared-docker/logs/vllm.log 2>&1
'
```

Wait ~2 minutes (watch `tail -f /shared-docker/logs/vllm.log` for
`Application startup complete`). Verify from the host:

```bash
curl http://localhost:8000/v1/models
```

### 8. Run the smoke test (from the host)

```bash
chmod +x backend/scripts/smoke-test.sh
./backend/scripts/smoke-test.sh
```

Expected: `PASS: model responded with: ...`

The script hits `http://localhost:8000` — the container publishes that
port to the host, so no `docker exec` is needed.

### 9. Update wiki

Edit `docs/wiki/setup-state.md` with: droplet IP, provision time, services
running, model downloaded.

Append entry to `docs/wiki/iteration-log.md`.

## When you finish

Push to GitHub:

```bash
git add docs/wiki/
git commit -m "feat: complete task 01 — vLLM serving in rocm container"
git push
```

Stop and report. Next task: 02-fastapi-wrapper.

## If something fails

- `docker ps` shows no `rocm` container → `docker start rocm`, or destroy
  the host and recreate with the AMD ROCm image
- `vllm --version` not found inside container → wrong image; recreate host
- vLLM OOMs on load → reduce `--max-model-len` to 2048
- Model download hangs → check HF_TOKEN; rerun the `huggingface-cli download`
- `rocm-smi` shows 0 GPUs in container → container missing `--device=/dev/kfd`
  or `--device=/dev/dri`; reinspect `docker inspect rocm`
- vLLM log shows `Address already in use` on port 8000 → another `vllm serve`
  is already running inside the container; `docker exec rocm pkill -f "vllm serve"`
  and retry

If something fails not on this list: stop, do not improvise, ask the user.
