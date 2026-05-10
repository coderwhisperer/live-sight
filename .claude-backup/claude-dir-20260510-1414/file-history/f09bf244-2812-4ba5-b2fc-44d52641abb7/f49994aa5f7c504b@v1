# Task 01 — Droplet Provision + vLLM Smoke Test

## Goal

Provision a fresh AMD MI300X droplet from scratch using the vLLM quick-start
image, get Qwen2-VL-7B serving, and pass a smoke test. Wall-clock target:
under 60 minutes from droplet creation.

## Acceptance criteria

1. Droplet provisioned, SSH key working.
2. Repo cloned to `/workspace/live-sight/`.
3. `~/.env` exists with `HF_TOKEN` set.
4. Qwen2-VL-7B downloaded to `/workspace/models/qwen2-vl-7b/`.
5. vLLM serving in tmux window `vllm` on port 8000.
6. `backend/scripts/smoke-test.sh` returns a description.
7. `docs/wiki/setup-state.md` updated.

## Steps

### 1. Provision (user, manual via web console)

- GPU plan: MI300X (1 GPU)
- Image: Quick Start → vLLM 0.17.1 / ROCm 7.2.0
- SSH key: select yours
- Click Create

Wait ~3 minutes. Note the IP.

### 2. SSH in

```bash
ssh root@<droplet-ip>
```

### 3. Verify environment

```bash
rocm-smi
vllm --version
```

Expected: 1 MI300X with 192GB shown by rocm-smi; vllm prints `0.17.1`.
If either fails, destroy the droplet and recreate.

### 4. Clone repo and install Claude Code

```bash
cd /workspace
git clone https://github.com/coderwhisperer/live-sight.git
cd live-sight

# Install Claude Code
curl -fsSL https://claude.ai/install.sh | bash
```

Sign in to Claude Code with your account.

### 5. Set up tmux sessions

```bash
tmux new-session -d -s live
tmux rename-window -t live:0 main
tmux new-window -t live -n vllm
tmux new-window -t live -n api
tmux new-window -t live -n train
```

### 6. Set environment variables

```bash
cat > /workspace/live-sight/.env <<EOF
HF_TOKEN=<your-hf-token>
ELEVENLABS_API_KEY=<optional>
EOF
chmod 600 /workspace/live-sight/.env
```

### 7. Download Qwen2-VL-7B

```bash
mkdir -p /workspace/models
pip install -U "huggingface_hub[cli]"
export HF_TOKEN=$(grep HF_TOKEN /workspace/live-sight/.env | cut -d= -f2)
huggingface-cli download Qwen/Qwen2-VL-7B-Instruct \
  --local-dir /workspace/models/qwen2-vl-7b \
  --token $HF_TOKEN
```

Expected: ~16GB, 5-15 minutes.

### 8. Start vLLM in its tmux window

```bash
tmux send-keys -t live:vllm "
HIP_VISIBLE_DEVICES=0 \\
PYTORCH_ALLOC_CONF=expandable_segments:True \\
vllm serve /workspace/models/qwen2-vl-7b \\
  --served-model-name qwen2-vl \\
  --port 8000 \\
  --max-model-len 4096 \\
  --dtype bfloat16
" Enter
```

Wait ~2 minutes. Verify:

```bash
curl http://localhost:8000/v1/models
```

### 9. Run the smoke test

```bash
chmod +x backend/scripts/smoke-test.sh
./backend/scripts/smoke-test.sh
```

Expected: `PASS: model responded with: ...`

### 10. Update wiki

Edit `docs/wiki/setup-state.md` with: droplet IP, provision time, services
running, model downloaded.

Append entry to `docs/wiki/iteration-log.md`.

## When you finish

Push to GitHub:

```bash
git add docs/wiki/
git commit -m "feat: complete task 01 — droplet provisioned, vLLM serving"
git push
```

Stop and report. Next task: 02-fastapi-wrapper.

## If something fails

- `vllm --version` not found → wrong image; destroy and recreate with vLLM image
- vLLM OOMs on load → reduce `--max-model-len` to 2048
- Model download hangs → check HF_TOKEN; rerun `huggingface-cli download`
- `rocm-smi` shows 0 GPUs → droplet misconfig; destroy + recreate

If something fails not on this list: stop, do not improvise, ask the user.
