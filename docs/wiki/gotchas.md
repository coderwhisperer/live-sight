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
**Fix**: None needed for dense models like Qwen2-VL-7B — the MoE code
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
Qwen2-VL-7B + 192 GB MI300X, observed VRAM after warm-up was 186.6 GB /
205.8 GB (`rocm-smi --showmeminfo vram`).
**Fix**: When we add the LoRA adapter (and later, training), drop
`--gpu-memory-utilization` to ~0.75 or lower the `--max-model-len` so
adapters and training optimizer state have headroom. Don't discover this
the night before the demo — size it during task 03 (LoRA wiring).
