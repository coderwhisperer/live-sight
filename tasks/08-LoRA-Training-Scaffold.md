# Task 08 — LoRA Training Scaffold

## Goal

Build a minimum viable training script that takes a JSONL file of
interactions and produces a LoRA adapter (.safetensors) for Qwen3-VL-8B.
This is foundation for tasks 09 (hot-swap) and 11 (train on real data).

Not in scope: production-quality training, hyperparameter optimization,
fancy logging, or training orchestration. Just: take input, run training,
save artifact.

## Why this matters

The 90s demo's hero beat is "the system learned Jamshed in a week." That
beat depends on a real LoRA adapter file that we can:

1. Show as a real .safetensors file in the demo dashboard
2. Prove was trained on his interactions (timestamp, file size, training
   loss curve)
3. Hot-swap into vLLM at runtime (task 09)

Without task 08, tasks 09 and 11 are dead. Without 11, the demo claim is
fiction.

## Acceptance criteria

1. A script at `backend/scripts/train-lora.sh` that takes a JSONL path
   and an output adapter directory, runs training, exits 0 on success.
2. Training produces a real adapter under
   `/shared-docker/adapters/<adapter-name>/` containing
   `adapter_config.json` and `adapter_model.safetensors`.
3. The adapter is small (<100MB — LoRA rank 8 or 16 should produce
   ~30-50MB).
4. Training script logs loss over time so we can show a real training
   curve in the demo.
5. End-to-end test: run the script on a 5-interaction sample of the
   real JSONL we collected today. Adapter file appears. No crash.
6. Script is idempotent: rerunning with same args overwrites the
   adapter cleanly without corrupting state.

## Steps

### 0. Verify droplet state

```bash
docker exec rocm pgrep -af "vllm serve" | head -1
curl -sf http://localhost:8001/health
ls /shared-docker/data/interactions/
```

All three should return healthy state.

Update `docs/wiki/setup-state.md` if anything has shifted.

### 1. Install the training stack into the host venv

Training needs different libraries than serving. Install into the existing
`backend/.venv`:

```bash
cd /shared-docker/live-sight/backend
.venv/bin/pip install \
  "transformers>=4.45.0" \
  "peft>=0.13.0" \
  "datasets>=2.20.0" \
  "accelerate>=0.34.0" \
  "trl>=0.10.0" \
  "torchvision"
```

If any of these conflict with FastAPI's existing pins, install into a
separate venv at `backend/.venv-train` instead. Document in
`backend/CLAUDE.md` which venv runs which job.

Verify:
```bash
.venv/bin/python -c "import transformers, peft, datasets, accelerate; print('ok')"
```

### 2. Write the training script

Create `backend/src/livesight/training/train_lora.py`. Structure:

```
load JSONL → format as chat-template messages → tokenize →
  load Qwen3-VL-8B with LoRA config → train → save adapter
```

Specific design choices:

**LoRA config**: target_modules on the language model only (not the
vision encoder). Rank 16, alpha 32. These are conservative defaults.

**Data formatting**: each JSONL row has image_b64, mode, response, and
optionally user_correction. For training, the target is whichever is
more "correct":
- If user_correction is present: use it as the target
- Else: use the model's response (this is self-supervised; the model
  learns its own outputs, which biases it toward consistency on this
  user's data)

Format each example as:
```
<system>You are a {mode} assistant for a blind user.</system>
<user><image>{image} What do you see?</user>
<assistant>{target_text}</assistant>
```

**Training params** for v0:
- batch_size: 1 (with gradient_accumulation_steps: 4)
- learning_rate: 2e-4
- num_train_epochs: 3
- max_steps: 50 (cap so test runs are fast)
- bf16: true
- gradient_checkpointing: true (saves VRAM)
- save_strategy: epoch
- logging_steps: 5

**Save path**: write the adapter to a directory passed as CLI arg,
default `/shared-docker/adapters/v0/`. Save adapter only (not full model).

### 3. Write a thin shell wrapper

`backend/scripts/train-lora.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail

INPUT_JSONL="${1:-/shared-docker/data/interactions/$(date +%Y-%m-%d).jsonl}"
OUTPUT_DIR="${2:-/shared-docker/adapters/v0}"
BASE_MODEL="${BASE_MODEL:-/shared-docker/models/qwen3-vl-8b}"

cd /shared-docker/live-sight/backend

echo "training LoRA"
echo "  input:  ${INPUT_JSONL}"
echo "  output: ${OUTPUT_DIR}"
echo "  base:   ${BASE_MODEL}"

.venv/bin/python -m livesight.training.train_lora \
  --input "${INPUT_JSONL}" \
  --output "${OUTPUT_DIR}" \
  --base-model "${BASE_MODEL}"

echo "done — adapter saved at ${OUTPUT_DIR}"
ls -la "${OUTPUT_DIR}"
```

Make executable: `chmod +x backend/scripts/train-lora.sh`

### 4. Test end-to-end on real data

Use today's JSONL (5 interactions). Run:

```bash
./backend/scripts/train-lora.sh
```

Expect:
- Loss prints every 5 steps
- Adapter saved to /shared-docker/adapters/v0/
- adapter_config.json + adapter_model.safetensors present
- Total runtime: 5-30 minutes for this small dataset

If it crashes:
- OOM during model load: lower max_seq_len or use 4-bit quantization
  (load_in_4bit=True)
- OOM during training: reduce batch_size further (already at 1) or
  enable optim="paged_adamw_8bit"
- Tokenizer or chat template errors: check Qwen3-VL's chat_template.json
  matches what we use in vllm_client.py

### 5. Document

`docs/wiki/decisions.md`: ADR for the training stack choice (PEFT +
transformers in host venv). Note that vLLM stays in the container
untouched.

`docs/wiki/setup-state.md`: add a section for adapters on disk. Track
adapter version, training data source, training timestamp, file size.

`backend/CLAUDE.md`: brief section on training. Note the venv strategy
and the script entrypoint.

### 6. Commit and push

```bash
git add backend/src/livesight/training/ backend/scripts/train-lora.sh \
  backend/CLAUDE.md docs/wiki/decisions.md docs/wiki/setup-state.md \
  tasks/08-lora-training-scaffold.md
git commit -m "feat(training): LoRA scaffold for Qwen3-VL adapters"
git push origin develop
```

## When you finish

Stop and report:
- Whether training ran end-to-end
- Adapter file size (should be 30-50MB at rank 16)
- Loss curve (5-10 datapoints minimum)
- Any OOM, tokenizer, or compatibility issues
- Whether the venv strategy worked or had to split

Don't proceed to task 09. Hot-swap is its own task.

## If something fails

- Transformers version too old for Qwen3-VL: upgrade to latest stable
- PEFT can't find the right target_modules for Qwen3-VL: print
  `model.named_modules()` and pick a few that match
  `model.language_model.layers.*.self_attn.q_proj` and similar
- Training data too small (5 examples) to train meaningfully: that's
  expected for v0. The point is the pipeline works, not that the
  resulting adapter is good. Task 11 trains on real data.
- Multimodal training is harder than text-only LoRA — if image
  preprocessing is the blocker, fall back to text-only training that
  uses the response field as both input and target. Document the
  fallback in decisions.md.

If something fails not on this list: stop, report, ask AJ.