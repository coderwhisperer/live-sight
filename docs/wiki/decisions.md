# Architecture Decision Records

Append a one-paragraph entry whenever a non-obvious decision is made.
Format: date, decision, rationale, alternatives considered.

## YYYY-MM-DD — Example entry format

**Decision**: Use Qwen2-VL-7B-Instruct over Llama 3.2-Vision.
**Rationale**: Better Urdu support, faster on ROCm, smaller footprint
leaves room for reasoning model + LoRA in same GPU.
**Alternatives**: Llama 3.2-Vision-11B (rejected: larger, weaker Urdu).

---

## 2026-05-04 — vLLM and FastAPI run inside Docker container `rocm`, not on host

**Decision**: All GPU-touching processes (vLLM, PyTorch training, FastAPI
backend) run inside the pre-existing `rocm` container. Host has no Python
ML stack installed. `/shared-docker` is bind-mounted into the container at
the same path so code paths don't have to translate.

**Rationale**: The AMD ROCm image we provisioned with already ships a
container that has vLLM 0.17.1+rocm700, ROCm 7, and Python 3.12 wired up
correctly. Reinstalling that on the host is duplicate work and fights the
image. Bind-mounting at the same path means `/shared-docker/models/…`
resolves identically from host and container — no path translation in
configs, scripts, or logs.

**Alternatives**:
- Install vLLM directly on host (rejected: duplicates a working setup,
  loses image's known-good ROCm versions).
- Bind-mount at a different path inside container, e.g. `/workspace`
  (rejected: paths in `setup-state.md`, scripts, and tracebacks would
  differ between host and container — a class of confusion not worth it).

## 2026-05-04 — Detached `docker exec -d` replaces tmux for service lifecycle

**Decision**: Long-running services (vLLM, FastAPI) start with
`docker exec -d rocm bash -c 'nohup … > /shared-docker/logs/X.log 2>&1 &'`
rather than from a tmux pane on the host or inside the container.

**Rationale**: tmux's job here was "process survives SSH disconnect" —
the docker daemon already provides that for `docker exec -d` children.
Adding tmux on top is a second lifecycle manager for no extra guarantee.
Logs to a file in the bind mount are reattachable via `tail -f` from
either side, which is all we'd use a tmux scrollback for.

**Alternatives**:
- tmux session on host, with each pane running `docker exec -it`
  (rejected: nested terminal multiplexing, harder to script, harder for
  Claude Code sessions to inspect).
- tmux *inside* the container (rejected: same survival guarantee for more
  ceremony; reattaching from a fresh shell requires `docker exec -it` +
  `tmux attach` instead of `tail -f log`).

## 2026-05-05 — Mode steering via simple direct user prompts (no system role, no examples)

**Decision**: Per-mode steering for `/describe` is done by sending a
single, short, natural-language user prompt — no `system` role message,
no structured `ROLE / OUTPUT FORMAT` headers, no example outputs in the
prompt. Each mode's prompt is one sentence (or a few) that directly
asks the model to do the thing:

- `read`: "What text is visible in this image? Transcribe it exactly."
- `scene`: "What can you see in this image? Describe it exactly."
- `navigate`: "You are guiding a blind person who has just taken this
  photo. Tell them what is directly in front of them, what is to their
  left and right, and any obstacles or hazards they should know about.
  Use distances in paces and object heights (hip-height, eye-level).
  Be brief — the user is listening to you, not reading."

**Rationale**: We arrived here after eight iterations against Qwen2-VL-7B
on the same fixed-image matrix. The first seven iterations used a
`system`-role prompt with structured directives, hard restrictions
("you will ONLY..."), and exact example outputs ("respond exactly:
'I do not see any text in this image.'"). Two failure modes recurred
no matter how the system prompt was framed:

1. **Echo of canned strings.** If the system prompt contained a literal
   "fallback" sentence, the model emitted that exact sentence on almost
   every input — even on images where the desired condition (e.g. "no
   text") was clearly false. Removing the literal string and substituting
   a different one just shifted which string got echoed. The attractor
   was the verbatim example, not the specific phrase.
2. **Echo of example outputs.** When the system prompt included an
   example navigate output ("A counter is directly in front of you at
   hip height, extending to your right..."), the model reproduced it
   word-for-word on the kitchen test image, ignoring the actual scene.
   The hallway and library inputs produced image-specific output;
   the kitchen specifically pattern-matched the example.

We tried structurally relocating the system prompt by prepending it to
the user message text (vLLM accepts both forms): that fixed kitchen-
navigate's regurgitation but didn't fix read-mode's bail. Read-mode
only stopped bailing once the example output was deleted from the
prompt entirely.

The simple direct user prompt approach skips both failure modes
because there's nothing in the prompt to echo. It also produces
image-specific output across all three test images and lets per-mode
output shape (terse for read, atmospheric for scene, directional for
navigate) emerge from the question itself rather than from explicit
formatting constraints the model ignores anyway.

**Tradeoffs accepted**:
- The "no text" responses on `read` are not a fixed string — they vary
  in phrasing ("The text in the image is not visible." vs. "The image
  does not contain any text.") run-to-run. Stable enough for TTS;
  we don't need an exact-string contract.
- Scene mode is more verbose than the previous "two to three short
  sentences" target. Acceptable for v0; LoRA fine-tuning (task 11) is
  the right place to refine output style if the demo needs tighter
  scene narration.
- Navigate output mixes "describe what's in front" + "to your left/
  right" + paces, but doesn't perfectly disambiguate "what's there"
  from "how to move past it." Same v0/LoRA caveat.

**Alternatives**:
- Keep the system-role prompt with examples removed (rejected:
  iteration 5 had this and read still bailed because the bail clause
  itself anchored the model).
- Few-shot prompting with multiple text-present + text-absent examples
  (rejected: increases prompt length, likely brings the echo attractor
  back stronger, longer prompts cost more tokens per call).
- Switch from Qwen2-VL-7B to a different VLM (rejected for v0:
  re-doing model selection costs days; the v0 quality bar is met by
  simple prompts).

**Per-mode max_tokens** were tuned alongside the prompts:
`navigate=350`, `read=600`, `scene=600`. Navigate is held tight to
keep the call inside the `<2s p95` budget on the more complex
hallway/text inputs. Read and scene finish naturally well before
their cap on every test image.

## 2026-05-05 — Swap from Qwen2-VL-7B to Qwen3-VL-8B-Instruct

**Decision**: After locking the iteration-8 prompts, A/B'd Qwen3-VL-8B
against Qwen2-VL-7B on the same fixed 3-image × 3-mode matrix. Qwen3-VL
won decisively on navigate, materially on read, and was matched-or-richer
on scene (at higher latency cost). Locked in Qwen3-VL-8B as the demo
model. Continuing to serve under the alias `qwen2-vl` so FastAPI's
`vllm_client` doesn't need to change — the alias is decoupled from the
underlying weights.

**Rationale**: Side-by-side outputs on the kitchen image, navigate mode:

> *Qwen2-VL*: "In front of you, there's a man and a woman... To your
> left, there's a stove with various pots and pans on it. To your right,
> there's a counter with more pots..."
>
> *Qwen3-VL*: "Directly in front: a black griddle or pan being held by
> a person, about 1 pace away. To your left: a woman holding a red lid,
> standing about 1.5 paces away, hip-height. ... Obstacles: The stove
> has hot elements — keep hands clear. The red pot is eye-level, hot.
> The griddle is close to your face — don't lean in."

That's the difference between an inventory of objects and actual
navigation guidance for a blind user. The acceptance criterion was
"actual spatial language (paces, heights, obstacle/hazard mentions)";
3-VL meets it natively without prompt engineering, 2-VL did not after
eight iterations.

Read mode similarly: 3-VL transcribes all three visible spine titles
(`BEAUTY FOOD`, `Home Chic`, `What on earth`) plus body text from the
open page; 2-VL only got two spines and didn't attempt body text.

**Tradeoffs accepted**:
- Latency goes up. Navigate kitchen at 2.7s and most scene calls at
  2.2–2.7s exceed the original `<2s p95` budget written into
  `backend/CLAUDE.md`. The budget was written assuming 2-VL's output
  shape; with 3-VL producing materially richer content per call, the
  cost is justified for v0. We may revisit the budget number itself
  if it becomes a real demo problem.
- Scene mode is more verbose (300–430 words vs 100–150). Acceptable
  for v0; LoRA fine-tuning (task 11) is the right place to refine
  output style.
- Disk cost: 17GB model in addition to the 16GB Qwen2-VL still on
  disk. Total /shared-docker/models is ~33GB. Safe to delete the
  2-VL directory once we're confident the swap stays.

**Alternatives considered**:
- Stay on Qwen2-VL-7B with iteration-8 prompts (rejected: navigate
  output is inventory-style, not guidance — would hurt the demo).
- Try Qwen2.5-VL (not run; 3-VL's gains were big enough that further
  exploration wasn't justified for the 13-day timeline).
- Use a non-Qwen VLM, e.g. LLaVA-Next or Llama-3.2-Vision (rejected:
  re-doing model selection costs days; 3-VL meets the bar already).

**vLLM compatibility**: 0.17.1+rocm700 supports
`Qwen3VLForConditionalGeneration` natively (no `--trust-remote-code`,
no model-card patches). Cold-start was 41s on MI300X (vs ~34s for 2-VL,
roughly proportional to model size). KV cache budget after warm-up:
151.85 GiB (vs 186 GiB for 2-VL) — 3-VL is 8B vs 2-VL's 7B but vLLM's
auto-sizing left more KV cache headroom for whatever reason.
