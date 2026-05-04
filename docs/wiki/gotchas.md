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

## vLLM — KV cache fills ~91% of GPU memory by default

**Cause**: vLLM defaults `--gpu-memory-utilization` to 0.9. With
Qwen2-VL-7B + 192 GB MI300X, observed VRAM after warm-up was 186.6 GB /
205.8 GB (`rocm-smi --showmeminfo vram`).
**Fix**: When we add the LoRA adapter (and later, training), drop
`--gpu-memory-utilization` to ~0.75 or lower the `--max-model-len` so
adapters and training optimizer state have headroom. Don't discover this
the night before the demo — size it during task 03 (LoRA wiring).
