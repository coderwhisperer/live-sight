# v1.1 vs v1 vs v0 vs base — comparison after retraining on doubled data

Date: 2026-05-10. Demo deadline tomorrow night.

v1.1 trained on 88 valid interactions (89 in JSONL, 1 placeholder
filtered) — up from 25 for v1. 18 with `user_correction` (up from
5). Same hyperparameters as v1: rank 16, max_steps=100,
shuffle=True, label-masked CE on assistant tokens, fp32 LoRA →
bf16 save (29.3 MB adapter).

Loss curve: 2.34 → 0.39 oscillating range, final mean **0.799**
(vs v1's 0.279). Higher because v1.1 sees 88 examples × 4.5 epochs
vs v1's 25 × 16 epochs at the same step budget — each example
gets fewer gradient updates, less per-example overfit. In a
healthier dataset world that's exactly what we'd want. For the
demo's "watch the model reproduce my correction" hero pattern,
it's a regression — see below.

All comparisons greedy decode (`temperature=0.0`).

---

## Test A — Read mode, study-methods note (in v1's training set, also in v1.1's)

This is the v1 hero comparison. Original auto-response had typos
`Kumon` and `Suid`; user corrected to `Kuman` and `Suuu`. v1 was
trained on the corrected target. We expect v1 to reproduce
`Kuman`/`Suud`; v0 and base to produce the original `Kumon`/`Suid`.

### `qwen2-vl` (base)

```
2. Kumon Method
- Daily byte sized learning
...
5. Suid (Art of focus)
```

### `livesight-v0`

```
2. Kumon Method
- Daily bite sized learning
...
5. Suid (Art of focus)
```

### `livesight-v1`

```
2. Kuman Method
-Daily bite sized learning
...
5. Suud (Art of focus)
```

v1 reproduces both corrections (`Kuman`, `Suud`) AND matches the
user's punctuation style (no leading space after dashes). This is
the demo's "the model learned my edits" pattern.

### `livesight-v1_1`

```
2. Kumon Method
- Daily byte sized learning
...
5. Suid (Art of focus)
```

**v1.1 reverts to the uncorrected `Kumon` and `Suid`.** The v1
correction memorization is lost. v1.1 produces output that's
indistinguishable from base on this image — same uncorrected
text, same dash spacing.

---

## Test B — Read mode, RAKtherm pipe-fitting signage (only in v1.1's training set)

This entry was logged on 2026-05-09, after v1 was trained. Only v1.1
saw it. Original auto-response misread `RAKtherm` as `Retherm`,
`Pioneered` as `Powered`. User corrected both.

### `qwen2-vl` (base)

```
Rotherm
Ultimate Piping Solutions
Powered
PP-R & PEX
ation Technology
```

### `livesight-v0`

```
Rotherm
Ultimate Piping Solutions
Powered
PP-R & PEX
ation Technology
```

### `livesight-v1`

```
Rotherm
Ultimate Piping Solutions
Powered
PP-R & PEX
ation Technology
```

All three above identical — none have seen the correction.

### `livesight-v1_1`

```
PP-R & PEX
Pioneered
Ultimate Piping Solutions
R
therm
ation Technology
```

v1.1 *did* learn one correction: `Pioneered` (which neither base
nor v1 produced). But it also broke reading order completely:
fragments and reorders the lines, splits "RAKtherm" into separate
"R" and "therm" lines. The output is worse to read aloud than the
uncorrected version.

---

## Outcome assessment: **C — v1.1 is worse than v1**

The headline failure is Test A: v1.1 lost v1's hero memorization
without gaining anything qualitatively better in return. Test B
shows partial learning of the new correction (`Pioneered`) but
overall output coherence collapsed (reading order broken).

### Likely cause

At the same `max_steps=100`, v1 saw each example ~16 times; v1.1
sees each ~4.5 times. The corrections in v1.1's data are getting
diluted by the larger (mostly uncorrected) ask-mode majority — 50
of the 88 valid entries are ask-mode, where responses tend to be
short factual answers ("a keyboard", "yes", "black") rather than
the verbose read/scene targets that benefit from training.

The mean loss of 0.799 vs v1's 0.279 reflects this: v1.1 is in a
healthier underfit regime, but the demo asset depends on
overfit-style memorization that 4.5 epochs doesn't deliver.

### Possible fixes (not run today; demo deadline tomorrow)

- **Train longer**: bump `max_steps` to 300 (~13.5 epochs at this
  data size). Risks the same overfit pattern v1 had, but on real
  data not just v1's 25-example slice.
- **Filter training data to corrected entries only**: 18 corrected
  rows × 100 steps = ~22 epochs of correction-focused training.
  Loses the broader data exposure but sharpens the demo signal.
- **Pick an earlier checkpoint**: we saved at steps 25/50/75/100
  per the v1 training fixes. Step 50 might still have v1's
  memorization without the late-stage drift on Test B.
- **Higher learning rate**: 2e-4 was tuned for v1's 25 examples;
  more data can absorb a higher LR (try 4e-4) without divergence.

For the demo: **keep v1 active**. v1.1 saved as backup but not
shipped. README does not need updating.

### What this commit ships

- `data-backup/adapters/v1_1/` — full adapter artifact (29.3 MB)
- `data-backup/v1_1-training-data.jsonl` — exact training corpus
  used (89 lines including the 1 placeholder)
- `data-backup/comparisons/v1_1-vs-v1.md` — this file
- `/shared-docker/training-runs/v1_1-checkpoints/` (NOT in repo,
  too large) — intermediate checkpoints if we want to test
  step-25/50/75 outputs later
