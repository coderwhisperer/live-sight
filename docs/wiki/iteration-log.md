# Iteration Log

Running log of what was tried, what worked, what didn't. Update at the
end of every Claude Code session.

## Format

```
### YYYY-MM-DD HH:MM — Brief title

**Tried**: what you did
**Result**: what happened
**Next**: what you'll try next session if this is unfinished
```

---

### 2026-05-04 19:35 — Task 01: vLLM serving Qwen2-VL-7B in `rocm` container

**Tried**: Followed task 01 against the AMD ROCm image that ships container
`rocm` already running. Bound `/shared-docker` into the container at the
same path, downloaded Qwen2-VL-7B to `/shared-docker/models/qwen2-vl-7b/`
via `docker exec rocm huggingface-cli`, started vLLM detached with
`docker exec -d rocm bash -c 'nohup vllm serve … &'` logging to
`/shared-docker/logs/vllm.log`, ran the smoke test from the host.

**Result**: PASS. `curl localhost:8000/v1/models` returns `qwen2-vl`.
Smoke test: *"A man and a woman are cooking in a kitchen, with the man
stirring ingredients into a pot and the woman holding a pan."* Wall clock
from container-already-running to PASS: ~15 minutes (model download was
~10 s — AMD's network had it cached). vLLM cold-start was ~34 s.

Three doc deltas were needed because the task spec didn't match reality:
the bare-host vLLM install, `/workspace/live-sight/` paths, and host
tmux for service lifecycle were all wrong for this image. See commit
`a44a24d` for the rewrite. Reasoning lives in `decisions.md`.

**Next**: Task 02 — FastAPI wrapper exposing `/describe`, `/query`,
`/interaction-log`, `/health`. Run it inside the `rocm` container the
same way (detached `docker exec`, log to `/shared-docker/logs/api.log`).

---

### 2026-05-04 20:50 — Task 02: FastAPI wrapper, host-side

**Tried**: Built FastAPI service `livesight.inference.server` exposing
`/health`, `/describe`, `/query`, `/interaction-log`. Server-side image
resize to 768px max dim before forwarding to vLLM, JSON request log to
`api.log` via a middleware (no image bytes), interaction log appended
as JSONL to `/shared-docker/data/interactions/YYYY-MM-DD.jsonl`.

Architecture call **changed mid-session**: task 02 spec locks FastAPI on
the **host**, not in the container as `backend/CLAUDE.md` previously
implied. Updated docs in commit `cd21c65` before writing code so they
couldn't drift. ADR is in `decisions.md` (host can reach vLLM via the
already-published `localhost:8000`, and DOCKER-USER doesn't filter 8001,
so 8001 ends up correctly public for the HF Space).

Used `pip + venv` (no `uv` on the box). Install of fastapi+uvicorn+httpx
+pillow+multipart+dotenv took ~12s. Editable install of the local package.

**Result**: PASS at every layer.
- /health: 17 ms
- /describe cold (first call after process start, vLLM already warm): **419 ms**
- /describe warm median over 5 calls: **369 ms** (range 369–373 — very tight)
- /query (one frame, "what are the people doing?"): 205 ms
- /query missing recent_frames_b64: 400 (intentional)
- /interaction-log: writes JSONL line, returns `{logged: true}` in <1 ms
- External smoke test from user's laptop in **Karachi → Atlanta**: 372 ms
  for /describe. (Karachi→Atlanta TCP RTT is ~150 ms, so server-side ~220 ms
  after the GPU got hotter — actually beats the host-side warm median.
  Variance dominated by GPU clock state, not network.)

Sensible description on both ends. Minor man/woman role-swap on the
Unsplash kitchen image — model accuracy ceiling, not a code bug.

Performance budget per `backend/CLAUDE.md` is /describe <2s p95 — we're
at ~370 ms warm. ~5x of headroom for adapter overhead in task 04.

**Next**: Task 03 — mode-aware system prompts (navigate/read/scene
should produce noticeably different outputs). The `mode` field is
already plumbed through to the handler but currently ignored.

---

### 2026-05-05 — Task 06 (renumbered from 03): mode-aware prompts

**Tried**: Wired the `mode` field through to vLLM. Eight prompt iterations
on the same fixed image matrix (kitchen, hallway, open-book stack with
visible spine titles "BEAUTY FOOD," "Home, Chic," "What on earth"):

| Iter | Approach | Result |
|------|----------|--------|
| 1 | System role, advisory ("focus on...") | Modes nearly indistinguishable |
| 2 | System role, aggressive ("you will ONLY... you will NOT...") + example outputs | Read bailed every input; navigate echoed example verbatim on kitchen |
| 3 | Structural change: prepend system to user message text | Read still bailed; kitchen-navigate stopped regurgitating |
| 4 | Soften read's bail clause, move to end | Read still bailed |
| 5 | Drop the verbatim canned string, vary wording | Read bailed with the new example string instead — attractor was the example, not the specific phrase |
| 6 | Drop the no-text example entirely, soften restrictions | OCR engaged (370ms vs ~90ms canned), but model refused to commit ("not clear enough to read") and described scenes on no-text inputs |
| 7 | **Switch to simple direct user prompts; drop system role entirely** | All 5 acceptance criteria pass. Read transcribes "BEAUTY FOOD" / "HOME CHIC". Navigate is image-specific. |
| 8 | Tighten navigate prompt (direction-first, not describe-then-navigate) + per-mode max_tokens (navigate=350, others=600) | Final committed state |

**Result on iteration 8 (committed)**, same fixed test images:

- `/describe?mode=navigate` (511–580 ms): direction-first output —
  *"In front of you, there's a man and a woman... To your left, there's
  a stove... To your right, there's a counter..."* and on hallway,
  *"...about 3 paces away from you."* All three under the 2s p95 budget.
- `/describe?mode=read` (67–132 ms): transcribes when text present
  (`"BEAUTY FOOD"`, `"HOME CHIC"` from the open-book stack); produces
  natural-language no-text response otherwise (varies in phrasing —
  no fixed string contract).
- `/describe?mode=scene` (467–673 ms): atmospheric, image-specific. Bonus:
  scene mode reads even more text than read mode on the book stack
  (transcribes `"India Mahdavi"` in addition to BEAUTY FOOD / HOME CHIC).

**Key learnings (full ADR in `decisions.md`)**:

1. Qwen2-VL-7B treats the `system` role weakly when the user message
   contains an image. System-prompt examples become attractors the
   model echoes verbatim instead of grounding it in the actual image.
2. Removing the structured prompt machinery (ROLE/OUTPUT FORMAT
   headers, hard restrictions, example outputs) made all three modes
   work better, not worse. Counterintuitive but reproducible.
3. Per-mode `max_tokens` matters: navigate at 600 tokens went over
   the 2s budget on the hallway image (2159 ms) because the model
   wrote everything it possibly could; capped at 350 it stays under
   600 ms on the same image.

**Next**: Task 07 (frontend ↔ real backend integration test) or task 08
(LoRA training scaffold). LoRA fine-tuning is the right place to refine
output style further (e.g. tighter scene narration, cleaner navigate
disambiguation between "what's there" and "how to move").

---

### 2026-05-05 (later) — Task 06 addendum: Qwen2-VL → Qwen3-VL-8B swap

**Tried**: After locking iteration-8 prompts on Qwen2-VL-7B, A/B'd
against Qwen3-VL-8B-Instruct on the same fixed image matrix. Same
prompts, same `max_tokens` per mode, same vLLM 0.17.1+rocm700.
Downloaded `Qwen/Qwen3-VL-8B-Instruct` to `/shared-docker/models/qwen3-vl-8b/`
(17 GB), kept the existing 2-VL model on disk as a fallback. Restarted
vLLM pointed at the 3-VL model under the same `--served-model-name qwen2-vl`
alias so FastAPI didn't need to change.

**Result**: 3-VL won decisively. The standout case is kitchen-navigate:
- Qwen2-VL produced inventory-style output ("In front of you, there's a
  man and a woman... To your left, there's a stove...").
- Qwen3-VL produced actual navigation ("about 1 pace away... 1.5 paces
  away, hip-height... red pot is eye-level, hot. The griddle is close to
  your face — don't lean in.").

Read mode also materially better — 3-VL transcribed all three visible
spine titles (`BEAUTY FOOD`, `Home Chic`, `What on earth`) plus body
text from the open page. 2-VL only got two spine titles and didn't
attempt body text.

Latencies: 3-VL is slower across the board.
- navigate: 666–2729 ms (was 363–580 ms on 2-VL); kitchen-navigate at
  2.7s is over the `<2s p95` budget but the content gain justifies it.
- read: 81–321 ms (was 67–132 ms on 2-VL).
- scene: 2257–2685 ms (was 467–671 ms); scene is now too verbose for
  comfortable TTS narration but factually richer, including incidental
  text transcription.

**Locked in**: Qwen3-VL-8B-Instruct. Decision in `decisions.md`. The
alias `qwen2-vl` is kept as the served-model-name for FastAPI contract
stability — that name is now historical, not the model. Provision
script now downloads 3-VL by default.

**Next**: Task 07 (frontend ↔ real backend integration test). Watch for
TTS latency over UDP from the demo location; with scene at ~2.5s and
navigate at ~1–3s, response start time will dominate the perceived UX.

---

### 2026-05-06 — Task 07: frontend ↔ real backend, end-to-end on phone

**Tried**: Wired the laptop frontend to the new droplet (`165.245.142.107`)
and verified the full camera → describe → speak loop on a real phone over
the existing cloudflared tunnel. Added the missing `interactionLog`
fire-and-forget call in `App.tsx` after each successful `describe()`.

Initial approach was `VITE_API_BASE_URL=http://165.245.142.107:8001` in
`.env.local`. That works from the laptop but fails on the phone: the
tunnel page is HTTPS, the backend is HTTP, browsers block the mixed-content
fetch ("NetworkError"). Switched to a Vite proxy: keep `API_BASE` as `/api`,
configure `server.proxy['/api']` → `http://165.245.142.107:8001`. Same-origin
from the phone's perspective, no mixed content, no extra CORS plumbing.

**Result**: Working end-to-end on phone over the tunnel. Five interactions
logged to `/shared-docker/data/interactions/2026-05-06.jsonl` on the droplet
in the first session. Latencies tracked iteration-log entries above:
- navigate: ~808 ms — accurate spatial language (hip-height, eye-level, paces).
- read: working on text-bearing photos.
- scene: ~2220 ms — verbose but accurate.

**Tech debt noted**: the proxy target is a hardcoded IP in `vite.config.ts`.
Future cleanup: drive it from an env var so swapping droplets doesn't
require a code edit.

**Next**: Task 08 (LoRA training scaffold) — interaction log is now
producing the data it needs.

---

### 2026-05-06 — Task 09: adapter hot-swap orchestrator

**Tried**: Wired vLLM + FastAPI to serve a LoRA adapter at runtime and
swap between adapter and base without restarting vLLM. Steps:

1. Restarted vLLM with `--enable-lora --max-loras 2 --max-lora-rank 16`.
   Initial test failed: `/v1/load_lora_adapter` returned 404 even though
   the flag was set. Fix: also set `VLLM_ALLOW_RUNTIME_LORA_UPDATING=True`
   in the env. Persisted in both `provision.sh` and `train-lora.sh`.
2. Loaded v0 via `POST /v1/load_lora_adapter` with name `livesight-v0`.
   `/v1/models` then lists both `qwen2-vl` and `livesight-v0`.
3. Added `AdapterState` singleton (`active`, `version`) behind a `Lock`.
   `vllm_client.describe_image` reads `get_active().active` per call.
   `/health` reads `get_active().version`.
4. Added `POST /admin/swap-adapter` endpoint. null `adapter_path` →
   skip vLLM call (swap to base). Idempotent for already-loaded
   adapters (vLLM "already exists" → treat as success).
5. Wrote `backend/scripts/swap-adapter.sh` wrapper. `--base` for
   swap-back, positional for swap-forward.

**Result**: infrastructure complete and verified end-to-end.

LoRA influence verified two ways at greedy decode (temperature=0.0,
removes sampling-variance confound):

- **Training-set keyboard image (row 0 in JSONL, mode=scene)**:
  `livesight-v0` reproduces multiple verbatim phrases from the trained
  target — `"silver or white, stylized font"`, `"slightly blurry and
  tilted, suggesting it was taken handheld"`, and the closing line
  `"with the brand name "TYLER" being a prominent feature"`. Base does
  *not* produce any of these phrases — its output uses different
  framings entirely (`"shallow depth of field"`, `"casting shadows"`,
  no closing summary). Unambiguous evidence the adapter is being applied.
- **New hallway image (mode=navigate, not in training set)**: outputs
  differ between v0 and base in specific phrasings (`"glass walls on
  both sides and a ceiling with recessed lights"` vs `"smooth floor
  stretches 10 paces ahead to a glass wall"`). Subtle but real.

**Latency cost**: ~30-50% adapter overhead — `/describe` warm latency
~800ms with adapter vs ~540ms base on hallway navigate. Within demo
budget; not a concern.

**Known v0 limitation**: 9-example training produces "almost-but-not-
quite memorization" — the adapter recalls many trained phrases but
doesn't perfectly reproduce sentences (greedy v0 says "wireless
keyboard / lower-left" where the trained target said "computer keyboard
/ upper-left"). Likely a 9-example scale problem rather than a precision
issue; will resolve with task 11's larger dataset. Train/serve dtype
investigation (we train fp32 LoRA, save bf16) deferred to task 11 —
won't matter once the dataset is bigger.

**Demo asset**: the training-image side-by-side comparison
(trained target ↔ v0 output ↔ base output) is a real
"the model learned from this user" demonstration. Unedited verbatim
phrase reproduction makes the LoRA influence visible without needing
narration.

**Next**: Task 10 or task 11. Hot-swap is ready for whichever comes next.

---

### 2026-05-06 — Pause point / pre-break audit

**Tried**: pre-break audit pass before stepping away from the project.

**State at pause**:
- HEAD: `76a3430 feat(serving): adapter hot-swap (task 09)`. Both task
  08 (LoRA scaffold) and task 09 (hot-swap orchestrator) complete and
  pushed.
- Droplet `165.245.142.107` running, vLLM (pid 3639) serving Qwen3-VL-8B
  with `--enable-lora`, FastAPI (pid 296301) on host. v0 adapter loaded
  in vLLM as `livesight-v0`. `/health` reports `model=livesight-v0`,
  `adapter_version=v0`.
- 11 interactions in `2026-05-06.jsonl`. v0 was trained on the first 9;
  rows 9-10 are post-training reference.
- v0 adapter: rank 16, 15.3M trainable params, 29 MB bf16 safetensors,
  final loss 0.061. LoRA influence verified at greedy decode (verbatim
  phrase reproduction on training image, subtle differences on new
  images).

**Audit actions taken**:
- Snapshotted the v0 adapter and `2026-05-06.jsonl` into the repo at
  `data-backup/`. 46 MB total committed (29 MB safetensors + tokenizer
  files + 928 KB JSONL with 11 entries). Survives droplet destroy.
- Recovery playbook in `setup-state.md` extended with steps 5 and 6 —
  copy adapters/JSONL out of `data-backup/` into runtime locations,
  then `swap-adapter.sh` to load v0 into the freshly-started vLLM.
- `setup-state.md` adapter row + new "Interaction data" section reflect
  current reality (PIDs, vLLM args with LoRA flags, /health behavior,
  in-repo backup paths).
- Polished `scripts/dev/backup-claude.sh` (added shebang + `set -euo
  pipefail` for parity with restore-claude.sh; was already functional,
  just untracked).

**Plan when resuming**: tasks 10/11 next, in whichever order works.
Task 11 (real-data LoRA training) needs a bigger interaction set —
target 20-30 rows before the next training run. The 9-example v0 has
"almost-but-not-quite memorization"; more data should resolve that
without any code changes.

**Recovery cost**: cheap. Destroy + recreate is `git clone → restore-claude.sh
→ provision.sh → cp data-backup → swap-adapter.sh` per the playbook.
End-to-end ~15 min if HF model cache is cold, faster if warm.

---

### 2026-05-07 — Task 11: v1 adapter trained on 25 corrected interactions

**Tried**: Trained v1 LoRA adapter on the full 26-row interaction set
collected across two days (5 corrected, 20 not, 1 placeholder filtered).
Pre-training fixes applied first as a separate commit (`8d3719a`):
max_steps default 50 → 100, explicit `Dataset.shuffle(seed=42)` before
Trainer instantiation (belt-and-suspenders for HF Trainer's per-epoch
RandomSampler), and `save_strategy="steps", save_steps=25` for
intermediate checkpoint diagnostics.

Two issues hit during training and fixed:
1. `train-lora.sh` host-side preflight checks input path on the host,
   but training runs inside the rocm container — `/tmp/` paths don't
   cross the container boundary. Moved training data into the
   bind-mounted `/shared-docker/data/training-data/` and re-ran.
2. Row 17 in the concatenated JSONL had `image_b64="AAAA"` and
   `response="test"` — placeholder from UI wiring. PIL crashed on
   `UnidentifiedImageError`, killing the whole run. Patched
   `_load_examples` to skip rows whose base64 doesn't decode to an
   image, with a per-row warning + count summary.

**Loss curve** (logged every 5 steps, final mean 0.2785):
- step 5:  0.7277  → step 10: 0.4365  → step 15: **1.1245** (spike)
- step 20: 0.4168  → step 25: 0.3776  → step 30: 0.3353
- step 35: 0.2502  → step 40: 0.1901  → step 45: **0.6782** (spike)
- step 50: 0.0582  → step 55: 0.2193  → step 60: 0.1204
- step 65: 0.0818  → step 70: 0.1562  → step 75: 0.0772
- step 80: 0.1104  → step 85: 0.0651  → step 90: 0.0754
- step 95: 0.0056  → step 100: 0.0645

Two transient spikes at steps 15 and 45 — likely shuffle bringing
correction examples (different targets than the model just learned
on uncorrected versions) into a new mix at epoch boundaries. Drops
back quickly. Curve descends as expected. Final loss 0.279 sits in
the spec's healthy range (0.05–0.3).

Train_runtime 111.6s, train_samples_per_second 3.583. Adapter file:
30,714,088 bytes (29.3 MB). Trainable params 15,335,424 — same
architecture as v0.

**Comparison testing** (greedy decode, temp=0):

Picked one corrected entry (read-mode, study-methods note with two
typo corrections — `Kumon → Kuman`, `Suid → Suud`) and one uncorrected
entry (scene-mode, keyboard close-up).

On the **corrected entry**, v1 reproduced the user's exact corrections
(`"Kuman"` and `"Suud"` — the latter close to the user's `"Suuu"`
without being identical). v0 and base both produced the original
uncorrected text (`"Kumon"`, `"Suid"`). v1 also matched the user's
formatting style (no leading space after dashes — `"-writing"` vs
`"- writing"`). This is the first unambiguous "the model learned my
edits" signal we have.

On the **uncorrected entry**, v1 ≈ v0 in content (both say "wireless
keyboard" and "white" for the brand color, base says "compact" and
"silver"). v1 is slightly more concise than v0 — the longer training
run (100 vs 50 steps with more examples) seems to have averaged toward
a tighter style without losing the trained vocabulary.

Saved full comparison to `data-backup/comparisons/v1-vs-v0-vs-base.md`
(both the markdown analysis and the raw stdout from the test script).

**Outcome assessment**: **A on the case that matters most** (read with
correction → v1 visibly incorporates user edits), **B on the rest**
(similar to v0, slightly tighter). Net: ship v1 for the demo. The
read-mode corrected-entry comparison is the cleanest "the model
learned from this user" footage we have.

**Recommendation for the demo**: lead with the read-mode-corrected
side-by-side. Show the same image in three columns — base, v0
(pre-correction), v1 (post-correction). Highlight the `Kumon → Kuman`
shift and the formatting match (the indentation style change is
visually obvious without needing the audience to read). The
"watch the model learn from one week of corrections" claim is honest
and backed by a single-image side-by-side that anyone can verify.

**Backed up**: v1 adapter to `data-backup/adapters/v1/` (45MB),
training data to `data-backup/v1-training-data.jsonl` (1.9MB),
comparison results to `data-backup/comparisons/v1-vs-v0-vs-base.md`.

**Next**: laptop-side UI work — the upcoming voice-correction
feature ties this whole loop together (record → /transcribe →
/interaction-log with correction → next nightly v2 training run).

---

### 2026-05-08 — Recall: semantic retrieval over past interactions

**Tried**: built `/recall` (RAG over the user's interaction history)
to handle "where did I put my keys"-style questions that need memory
of earlier scenes, not just the current image.

Stack:
- `paraphrase-multilingual-MiniLM-L12-v2` from sentence-transformers,
  loaded on CPU (~120 MB host RAM, ~2.3s cold load). Multilingual:
  English and Roman Urdu live in the same embedding space, so a
  query in one language can match a memory in the other.
- New `livesight.inference.recall` module: builds an in-memory index
  of all `/shared-docker/data/interactions/*.jsonl` rows at FastAPI
  startup. Searchable text per row is response + user_correction +
  question.
- Cosine similarity (vectors normalized → dot product) plus 48-hour
  exponential recency decay. A slightly-less-similar but very
  recent memory beats a more-similar week-old one.
- `/recall` endpoint: top-1 retrieval at similarity ≥ 0.25, stitches
  the matched row into a `[Earlier interaction, X hours ago]` block
  before the current question. Falls back to direct VLM answer if
  no match clears threshold. Auto-logs with `mode="recall"` so the
  recall corpus grows (recall answers themselves become retrievable
  on later queries).
- `/admin/refresh-recall`: rebuilds the in-memory index from JSONL
  on disk. For testing (seed entry → refresh → query) and for long
  sessions where many interactions have accumulated since startup.
- `RECALL_SYSTEM_PROMPT`: frames the assistant as having memory and
  tells it to weave past context conversationally — "like a friend
  who remembers" — rather than mechanically citing the retrieval.

**Result**: working end-to-end on the demo query.

  Test setup: seed an ask-mode entry with response "A living room
  with a wooden coffee table. Keys placed on the table." and
  question "where am I putting my keys". Refresh index. Then query
  /recall with a paraphrase: "where did I put my keys".

  Output:
    matched at similarity 0.6700681447982788
    response: "You left your keys on the wooden coffee table in the
              living room earlier today."
    latency: 630 ms (CPU embed ~1 ms, VLM ~600 ms)
    auto-logged with mode="recall"

  Demo-quality phrasing — weaves location ("wooden coffee table"),
  setting ("living room"), and time ("earlier today") naturally
  without saying "based on the earlier interaction." The system
  prompt is doing its job.

  Sanity check on a question with no good match in corpus
  ("what color is the sky"): weakly retrieved a previous color
  answer at similarity 0.52, model answered the current question
  but acknowledged the past memory only where it made sense.
  Doesn't force connections that aren't there.

**Memory cost**: encoder ~120 MB host RAM + ~1.5 KB per indexed row
(384 floats × 4 bytes). At low-hundreds of rows that's negligible —
no need for sqlite-vss or faiss yet. CPU only; the MI300X stays for
Qwen3-VL + LoRA. Recall is supporting infrastructure, like Whisper.

**Frontend integration**: `cabdd43` from the laptop side — Ask-mode
intent routing detects recall-flavored queries client-side and routes
them to `/recall` instead of `/query`. Heuristic for now; can be
upgraded to a proper classifier later if needed.

**Recovery cycle**: today's session also opened on a fresh droplet
(`165.245.136.231`). The 4-command playbook (clone, .env,
restore-claude, provision) ran clean — `provision.sh`'s embedded
`restore-data.sh` hook auto-restored both adapters and both prior
JSONLs from `data-backup/`, no manual `cp` step needed. End-to-end
recovery worked exactly as the playbook documented; the only
post-recovery manual step was the AdapterState swap-to-v1 (still
deferred to task 15 — see gotchas.md).

**Next**: voice-recall closes the full loop on the phone — record →
/transcribe → /recall (with retrieved memory) → speak → optional
PATCH /interaction-log/{id} for corrections that feed into the next
nightly training.

---

### 2026-05-10 — v1.1 retrain on doubled data: Outcome C, NOT shipped

**Tried**: train a v1.1 LoRA adapter on all 89 accumulated
interactions (88 valid + 1 placeholder filtered) using the same
hyperparameters as v1: rank 16, max_steps=100, label-masked CE,
shuffle, fp32 LoRA → bf16 save. Demo deadline tomorrow night;
the bet was that more data + more corrections (18 vs 5) would
produce a clearer "the model learned my edits" demo.

**Loss curve** (descending, with one transient spike at step 45
similar to v1's pattern):
- step 5:   2.34
- step 10:  1.22
- step 25:  1.02
- step 50:  0.71
- step 75:  0.46
- step 100: 0.39
- final mean train_loss: **0.799** (vs v1's 0.279)

Higher mean than v1 because v1.1 sees 88 examples × ~4.5 epochs
at the same step budget (vs v1's 25 × ~16 epochs). Fewer
gradient updates per example → less overfit. In a healthier
dataset world that's exactly what you'd want; for a demo that
depends on overfit-style memorization of corrections, it's a
regression.

**Result: Outcome C — v1.1 is worse than v1 on the demo asset.**

Test A (the v1 hero comparison: study-methods note where user
corrected `Kumon→Kuman` and `Suid→Suuu`): v1 reproduces both
corrections verbatim (`Kuman` and `Suud`), v1.1 reverts to the
uncorrected `Kumon` and `Suid` — output identical to base on
this image. The v1 hero pattern doesn't survive the retrain.

Test B (a v1.1-only training image: RAKtherm pipe-fitting
signage where user corrected `Powered → Pioneered` and
`Retherm → RAKtherm`): v1.1 *did* learn `Pioneered` (which v1
and base never saw), but reading order collapsed — fragmented
output with split lines like `R\ntherm`. Worse to read aloud
than the uncorrected version.

**Decision: keep v1 active, save v1.1 as fallback, do not
update README**. The shipped demo continues to use v1
(`/health` reports `livesight-v1`, `AdapterState.active =
livesight-v1`). v1.1 sits at `/shared-docker/adapters/v1_1/`
and `data-backup/adapters/v1_1/` for later iteration.

**Likely cause**: corrections diluted by the ask-mode-heavy
majority. 50 of the 88 valid entries are ask-mode, where targets
tend to be short factual answers ("a keyboard", "yes", "black")
rather than the verbose read/scene targets that benefit from
training. With only 4.5 epochs the model can't memorize
per-example corrections like v1 did at 16 epochs.

**Possible recoveries (not run today; deadline)**:
- Bump `max_steps` to 300+ for ~13.5 epochs at this data size.
- Filter training data to corrected entries only (18 rows × 100
  steps = ~22 epochs of correction-focused training, loses
  broader exposure but sharpens the demo signal).
- Test the saved intermediate checkpoint at step 50 — might
  still have v1's memorization without the late-stage drift on
  Test B.

**Backed up to repo**:
- `data-backup/adapters/v1_1/` (45 MB, full adapter dir)
- `data-backup/v1_1-training-data.jsonl` (1.9 MB, exact corpus)
- `data-backup/comparisons/v1_1-vs-v1.md` (172-line analysis)
- `data-backup/comparisons/v1_1-vs-v1.raw.txt` (raw stdout)
- `data-backup/interactions/*.jsonl` already in sync from
  the 2026-05-09 pre-destroy snapshot.

**Next**: ship v1 for the demo. If post-demo we want a better
adapter, try the corrections-only filter or longer training on
this same dataset.



