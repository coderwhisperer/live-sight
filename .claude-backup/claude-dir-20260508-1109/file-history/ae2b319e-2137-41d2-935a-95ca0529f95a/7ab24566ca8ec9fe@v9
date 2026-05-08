# Gotchas

Surprises and their fixes, so future sessions don't re-hit them.

## Format

```
## <component> — <symptom>
Cause: ...
Fix: ...
```

---

## vLLM on ROCm — startup warning `Using legacy triton_kernels on ROCm`

**Cause**: At import of `vllm/.../fused_moe/gpt_oss_triton_kernels_moe.py`,
two optional symbols (`SparseMatrix`, `make_ragged_tensor_metadata`) aren't
present in the ROCm build of `triton_kernels`. The module logs a warning
and sets `use_legacy_triton_kernels = True`.
**Fix**: None needed for dense models like Qwen3-VL-8B (or the prior
Qwen2-VL-7B) — the MoE code
path is never executed, so the legacy flag is dormant. Re-evaluate if we
swap to an MoE model (Mixtral, Qwen2-MoE, DeepSeek): then the legacy path
*does* run and may differ in speed or numerics.
**Don't confuse with**: a sibling `ERROR Failed to import Triton kernels`
from the same file — that one means triton itself failed and serving will
be broken.

## Networking — `curl <public-ip>` from the host tells you nothing about external reachability

**Cause**: The host owns its public IP directly on `eth0` (`ip -4 addr show`
lists `129.212.179.191/20` on eth0 — normal for DigitalOcean droplets).
When you `curl http://<public-ip>:<port>` from the host, the kernel sees
the destination as one of its own IPs and short-circuits through `lo` —
the packet never traverses `eth0`, never hits `iptables FORWARD` /
`DOCKER-USER`, never leaves the box. A sub-millisecond response time
(e.g. `0.000962s`) is the tell.
**Fix**: To verify external reachability, curl from your workstation,
not from the droplet. From the droplet itself, `curl localhost:<port>`
is honest — testing the published port via the public IP is not.

## Debugging vLLM from your workstation without exposing port 8000

**Cause**: Port 8000 (vLLM) is intentionally blocked from the public
internet by an iptables `DOCKER-USER` DROP rule supplied by the AMD ROCm
image. The architecture has the HF Space talk to FastAPI on 8001, not to
vLLM directly. So you can't just `curl <droplet-ip>:8000` from your laptop.
**Fix**: SSH local port forward — opens nothing on the droplet's public
interface, just tunnels over the existing SSH connection:

```bash
ssh -L 8000:localhost:8000 root@<droplet-ip>      # leave session open
# then on your workstation, in another terminal:
curl http://localhost:8000/v1/models
```

`localhost:8000` on your laptop now reaches `localhost:8000` on the
droplet, which is where `docker-proxy` is listening. The DOCKER-USER
DROP rule sees in-iface=`lo` (not `eth0`) and doesn't fire.

## bash — `set -euo pipefail` + `find` in a command substitution silently kills the script

**Cause**: A line like
```bash
shard_count=$(find "${DIR}" -maxdepth 1 -name '*.foo' 2>/dev/null | wc -l)
```
*looks* safe but exits the whole script when `${DIR}` doesn't exist:
- `find` exits 1 (no such directory)
- `pipefail` makes the pipeline `find | wc -l` exit 1
- the simple command `var=$(...)` inherits the substitution's exit status (1)
- `set -e` kills the script
- `2>/dev/null` swallowed find's stderr, so **nothing** reaches the terminal

This bit `provision.sh` step 4 twice on a fresh droplet — the script
appeared to succeed but actually exited right after printing the
`=== ensuring model at … ===` step header, before the model download ever
ran. Reproduces under bash 5.2 with `inherit_errexit` off.

**Fix**: ensure the directory exists before `find`:
```bash
mkdir -p "${DIR}"
shard_count=$(find "${DIR}" -maxdepth 1 -name '*.foo' | wc -l)
```
Bonus: drop the `2>/dev/null`. The whole reason it was masking errors is
the same reason it's a footgun. If find can fail for reasons other than
missing-dir, handle them explicitly.

**Smell to watch for**: any `$(... 2>/dev/null | ...)` under `set -euo
pipefail`. The redirect hides exactly the diagnostics you'd need.

## Secrets — `docker exec -e HF_TOKEN="$value"` leaks the token to `ps`

**Cause** (hit 2026-05-05): we ran
```bash
docker exec -e HF_TOKEN="$(grep ^HF_TOKEN= ... | cut -d= -f2)" rocm bash -c '...'
```
to inject the HF token into the container for a `huggingface-cli download`.
That works, but the literal token value ends up on the docker-exec command
line. While the process is running, `ps -eo cmd` shows it to anyone with
shell access on the host (and `/proc/<pid>/cmdline` is world-readable by
default on Linux). The token also shows up in any tool output that
captures `ps` — including this Claude Code session's transcript.

**Fix**: don't pass secrets as `-e KEY=value` on a docker exec/run command
line. Two safer patterns:

1. **`--env-file`** (preferred for our setup, since the .env is already on
   the bind-mounted volume):
   ```bash
   docker exec --env-file /shared-docker/live-sight/.env rocm bash -c '...'
   ```
   The container only sees the env vars; `ps` shows the file path, not
   the values.

2. **Read inside the container** (no env passing at all — what
   `provision.sh` does):
   ```bash
   docker exec rocm bash -c '
     export HF_TOKEN=$(grep ^HF_TOKEN /shared-docker/live-sight/.env | cut -d= -f2-)
     huggingface-cli download …
   '
   ```
   The grep runs inside the container, so the token never crosses a
   command-line boundary.

**If you've already leaked**: rotate the token at huggingface.co/settings/tokens.
The exposure window is short (only while the docker exec process runs)
but real, especially on a multi-tenant host.

## faster-whisper / CTranslate2 has no ROCm support — STT runs on CPU

**Symptom** (hit 2026-05-07 during STT integration): you install
`faster-whisper`, expect it to use the MI300X like vLLM does, and
`device='cuda'` quietly falls back or errors. `ctranslate2.get_cuda_device_count()`
returns `0` on this ROCm host even though `rocm-smi` shows the GPU
present. The pip wheels for `ctranslate2` are built against NVIDIA
CUDA only — they don't pick up HIP devices, and there's no ROCm wheel
on PyPI as of CT2 4.7.1.

**Fix**: use `device='cpu'` + `compute_type='int8'`. On this host
that gets ~0.5× realtime on `whisper-large-v3` (4s audio → ~8s
decode). Acceptable for one-off voice corrections (5-30s audio →
10-60s wait); not acceptable for real-time captioning.

If you ever need GPU Whisper on ROCm: build CTranslate2 from source
against ROCm, or use a community fork. Multi-hour project, deferred
indefinitely. Alternative is transformers-Whisper inside the rocm
container alongside vLLM — works on ROCm via the existing torch+HIP
stack, but adds VRAM pressure to vLLM's already-tight 19 GB headroom
and is materially slower than faster-whisper at equivalent quality.

**Don't confuse with**: vLLM's `--enable-lora` ROCm support, which IS
mature and works fine. The CT2/ROCm gap is specific to ctranslate2,
not a general ROCm-Python ecosystem statement.

## Whisper hallucinates on silent audio (large-v3 specifically)

**Symptom** (hit 2026-05-07): a 1s silent WAV sent to `/transcribe`
returned `"Teksting av Nicolai Winther"` — Norwegian for "Subtitles
by Nicolai Winther". 100% hallucinated. The endpoint returned
`language=nn` with 0.31 confidence and `duration_s=1.0`.

**Cause**: whisper-large-v3 was trained extensively on YouTube
subtitle data, where end-of-video subtitle credits are common and
silent. When fed silence, it pattern-matches to "this is an
end-of-video silence" and emits a typical credit string. Different
silent-audio inputs can produce different language credits ("Sub by
…", "Tekstning af …", etc.) — there's no fixed string, but there
IS a strong attractor toward subtitle-credit-shaped output.

**Fix**: the frontend that records corrections should client-side
trim leading/trailing silence (browser VAD or a simple amplitude
threshold) before uploading. As a backend safety net, we could
gate the response on `info.language_probability > 0.5` and return
empty transcript otherwise — but VAD on the recording side is the
better fix because it also reduces upload size and decode time.

**Don't confuse with**: actual misrecognition of low-volume speech.
This is specifically the silent-audio failure mode; quiet-but-real
speech transcribes correctly with appropriate language detection.

## Recovery playbook gap: data-backup needed manual restoration

**Symptom** (hit 2026-05-06, second recovery cycle): after a fresh
droplet provision via the playbook, vLLM came up cleanly with
`--enable-lora` but `/v1/models` listed only the base model. Both
`/shared-docker/adapters/` and `/shared-docker/data/interactions/`
were empty. The adapter weights and interaction JSONL were sitting
untouched in `data-backup/` (which had come down with the git clone)
but never made it to the runtime paths the services read from.

**Root cause**: the playbook of the day had 6 steps. Steps 1-4 were a
single command each: clone, .env, restore-claude.sh, provision.sh.
Steps 5-6 were manual `cp -r` commands and a manual `swap-adapter.sh`
call that you had to remember after provision.sh finished. Easy to
miss; we did miss it.

**Fix**: `scripts/dev/restore-data.sh` does the copy + load. It's
idempotent (skip-if-exists at every copy step, and treats vLLM's
"already loaded" 400 as success). `provision.sh` calls it after
FastAPI is verified up and before the smoke test. Recovery is now 4
commands; the destroy/recreate cycle no longer requires anyone to
remember the data-backup step.

**Multiple adapters**: when several adapter directories exist under
`data-backup/adapters/` or `/shared-docker/adapters/`, restore-data.sh
sorts lexicographically and makes the highest-versioned one
(e.g. `v1` over `v0`) the active routing target. Lower adapters are
loaded into vLLM but don't touch `AdapterState`, so they're available
for fast manual swaps without changing the demo state.

**Related, deferred to task 15**: `/health` reports `AdapterState`'s
intent — the routing target FastAPI is set to use — rather than vLLM's
actually-loaded models. We caught this gap tonight only by manually
querying `/v1/models`. If swap-adapter.sh fails to load an adapter into
vLLM but FastAPI's AdapterState updates anyway (or vice versa), `/health`
would report the inconsistency as healthy. Real fix is to make `/health`
do a `GET /v1/models` round-trip and verify the active name appears in
the loaded list. Out of scope for this commit.

## vLLM — `--enable-lora` is necessary but not sufficient for runtime adapter loading

**Cause** (hit 2026-05-06 during task 09): vLLM 0.17.1+rocm700 starts
cleanly with `--enable-lora --max-loras 2 --max-lora-rank 16`, advertises
"LoRA enabled" in its log, accepts adapter requests via the existing
`model` field on chat completions — but `POST /v1/load_lora_adapter`
returns **HTTP 404**. The endpoint isn't registered. `/openapi.json`
shows only `/load` (a load-progress check, not load-adapter).

The flag enables the LoRA *runtime* but not the *runtime-loading API*.
Those are separate switches in this version.

**Fix**: also set `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True` in the env
when starting vLLM:
```bash
docker exec -d rocm bash -c "
  VLLM_ALLOW_RUNTIME_LORA_UPDATING=True \
  ...
  vllm serve ... --enable-lora --max-loras 2 --max-lora-rank 16 ..."
```
After that, `/v1/load_lora_adapter` and `/v1/unload_lora_adapter` show
up in `/openapi.json` and behave as documented.

Both `scripts/dev/provision.sh` and `backend/scripts/train-lora.sh`
already set the env var, so fresh provisions work out of the box. If
you ever start vLLM by hand without this script, remember the env var.

**Don't confuse with**: `--no-enable-lora` (the negation form of the
flag) — that's a different thing. Or with passing adapters via
`--lora-modules name=path` at startup, which works without the env var
because adapters are loaded at engine init, not via the runtime API.

## AMD ROCm image — `apt-get upgrade` during active work breaks Docker / kernel state

**Cause**: The AMD ROCm image pins specific kernel modules, ROCm runtime,
and Docker components together. A blanket `apt-get upgrade` can pull in
new kernel headers / packages that don't match the running kernel, leave
Docker in a broken state, or update userspace that the ROCm container
images expect at a fixed version. The previous droplet (`129.212.179.191`)
had to be destroyed and rebuilt after this happened.

**Fix**: don't `apt-get upgrade` on a working droplet. If you need a
specific package, install it targeted (`apt-get install -y <pkg>`).
Treat blanket upgrades as a deliberate "I'm about to redeploy this droplet
anyway" action, not routine maintenance.

## vLLM — KV cache fills ~91% of GPU memory by default

**Cause**: vLLM defaults `--gpu-memory-utilization` to 0.9. With
192 GB MI300X loading Qwen2-VL-7B, observed VRAM after warm-up was
186.6 GB / 205.8 GB. With Qwen3-VL-8B vLLM auto-sizes KV cache to
151.85 GiB — different headroom but same "fills most of the GPU"
behavior (`rocm-smi --showmeminfo vram`).
**Fix**: When we add the LoRA adapter (and later, training), drop
`--gpu-memory-utilization` to ~0.75 or lower the `--max-model-len` so
adapters and training optimizer state have headroom. Don't discover this
the night before the demo — size it during task 03 (LoRA wiring).
