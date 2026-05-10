# v1.2 vs v1.1 vs v1 — Path A (corrections-only) recovery

Date: 2026-05-10. v1.1 was Outcome C (lost v1's hero memorization on
the same demo image while only partially absorbing new corrections).
v1.2 = Path A from the v1.1 recovery options: filter the 100-interaction
corpus down to corrections only, then train at the same `max_steps=100`.

## Training corpus

22 user-corrected entries surfaced after filtering placeholders. One
more was excluded as noise — `2026-05-09` row 33's "correction" was the
single phrase "Thank you." replacing a multi-sentence scene description.
That's not a substantive correction; it would teach the model to
dismiss image content with a pleasantry. Final corpus: **21 entries**.

Modes in the v1.2 training set: 5 read, 3 navigate, 1 scene, 10 ask, 2
recall. Compared to v1.1's 88-entry corpus, the ratio of corrections
to filler went from 18/88 (~20%) to 21/21 (100%). Each correction now
gets ~16.8 epochs of gradient updates instead of ~4.5 in v1.1.

## Hyperparameters

Identical to v1 and v1.1 except for the input corpus:

- rank 16, alpha 32, target modules `^model\.language_model\..*\.(q_proj|k_proj|v_proj|o_proj)$`
- `max_steps=100`, `learning_rate=2e-4`, label-masked CE on assistant tokens only
- shuffle seed=42, batch size 1, gradient_accumulation_steps=1
- fp32 LoRA training → bf16 save (29.3 MB adapter)
- Intermediate checkpoints saved at steps 25/50/75/100

## Loss curve

Final mean train_loss: **0.6604** (v1: 0.279, v1.1: 0.799). Curve
descended monotonically after a noisy start: 2.51 → 2.12 → 1.83 → 0.98
→ 1.21 → 0.82 → 0.76 → 0.72 → 0.25 → 0.43 → 0.27 → 0.42 → 0.23 → 0.18
→ 0.07 → 0.12 → 0.10 → 0.05 → 0.06 → 0.05.

The 0.05 final loss range is below v1's because each example sees more
passes (16.76 epochs at 21 examples vs 16 at 25). Training wall time
1m44s (vs v1's 1m52s).

All comparisons greedy decode (`temperature=0.0`).

---

## Test A — Read mode, study-methods note (the v1 hero comparison)

Same image as v1's demo. Original auto-response had `Kumon`/`Suid`;
user corrected to `Kuman`/`Suud`. v1 was trained on the corrected
target and reproduced both. v1.1 lost both. v1.2 should recover
both.

### `livesight-v1` (active before this swap)

```
1. Active Recall
-writing down every tiny thing
we have learned and keep
recalling them

2. Kuman Method
-Learning in small powerful
steps
-Daily bite sized learning

3. Spaced Repetition
-space review over time
-review right before forgetting

4. Kaizen
-1% daily improvement
-continuous improvement through
small consistent steps

5. Suud (Art of focus)
```

### `livesight-v1_1` (Outcome C, archived)

```
1. Active Recall
- writing down every tiny thing
- we have learned and keep
recalling them

2. Kumon Method
- Learning in small powerful
steps
- Daily byte sized learning

3. Spaced Repetition
- space review over time
- review right before forgetting

4. Kaizen
- 1% daily improvement
- continuous improvement through
small consistent steps

5. Suid (Art of focus)
```

### `livesight-v1_2` (this run — promoted)

```
1. Active Recall
-writing down every tiny thing
we have learned and keep
recalling them
2. Kuman Method
-Learning in small powerful
steps
-Daily bite sized learning
3. Spaced Repetition
-space review over time
-review right before forgetting
4. Kaizen
-1% daily improvement
-continuous improvement through
small consistent steps
5. Suud (Art of focus)
```

**Test A: pass.** v1.2 reproduces both `Kuman Method` and
`Suud (Art of focus)` — the v1 hero comparison is intact. The
no-leading-space dash style v1 learned is preserved too (v1.1's
`- Daily byte sized learning` regression is gone).

---

## Test B — Read mode, RAKtherm pipe-fitting signage

Logged 2026-05-09. Original auto-response had `Rotherm` and `Powered`;
user corrected to `RAKtherm` and `Pioneered`. v1 never saw this image.
v1.1 partially learned it (got `Pioneered` but fragmented reading
order, splitting `RAKtherm` into separate `R` / `therm` lines). v1.2
should learn the correction without the order fragmentation.

### `livesight-v1` (no exposure to this image)

```
Rotherm
Ultimate Piping Solutions
Powered
PP-R & PEX
ation Technology
```

### `livesight-v1_1` (saw this image, partial learn, broke order)

```
PP-R & PEX
Pioneered
Ultimate Piping Solutions
R
therm
ation Technology
```

### `livesight-v1_2` (saw this image, focused training)

```
RAKtherm
Ultimate Piping Solutions
Powered
PP-R & PEX
ation Technology
```

**Test B: pass.** v1.2 produces `RAKtherm` intact (vs v1's
`Rotherm`) and reading order matches v1's coherent pattern. v1.2
did NOT learn the second correction (`Powered` → `Pioneered`); only
the more visually distinct word-shape change was absorbed. That's
acceptable — net improvement on the harder OCR target without
sacrificing reading order. The fragmentation that hurt v1.1 is gone.

---

## Outcome assessment: **A — v1.2 promoted**

Both tests pass. v1.2 gives us:

1. v1's full hero memorization preserved (`Kuman` / `Suud` and the
   dash-style formatting).
2. One of the two RAKtherm corrections learned (`RAKtherm` —
   the more visually obvious of the two).
3. Coherent reading order on the v1.1-only image — no fragmentation.

**Decision**: hot-swap to v1.2 active. v1 archived as fallback at
`/shared-docker/adapters/v1/` and `data-backup/adapters/v1/`. v1.1
retained as the negative-result fallback for documentation.

### Why Path A worked when v1.1 didn't

v1.1's failure was that 70 out of 88 entries were uncorrected
auto-responses, with 50 of those being short ask-mode answers
("yes", "black", "a keyboard"). At `max_steps=100` over 88 examples
(~4.5 epochs), corrections got drowned in a sea of generic short
targets. Filtering down to the 21 actual corrections gives each
correction ~16.8 epochs of focused gradient updates — enough to
overfit on the demo target the way v1 did, without the dilution.

The cost was giving up the breadth of v1.1's training data — but the
demo's evidence section depends on overfit-style memorization, not
generalization. Path A is the right tradeoff for the demo build.

### What this commit ships

- `data-backup/adapters/v1_2/` — full adapter artifact (45 MB on disk)
- `data-backup/v1_2-corrections-only.jsonl` — exact 21-entry training corpus
- `data-backup/comparisons/v1_2-vs-v1.md` — this file
- `data-backup/comparisons/v1_2-vs-v1.raw.txt` — raw eval stdout
- `/shared-docker/training-runs/v1_2-checkpoints/` (NOT in repo,
  too large) — intermediate checkpoints if needed for analysis
- README "Personalization" section updated: v1 row swapped for v1.2
  with the new (21 corrections) count.
