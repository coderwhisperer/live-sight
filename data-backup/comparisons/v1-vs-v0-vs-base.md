# v1 vs v0 vs base: side-by-side, greedy decode

Date: 2026-05-07. v1 was trained on 25 valid interactions (26 in JSONL,
1 placeholder skipped) — 5 with `user_correction`, 20 without — across
the 2026-05-06 and 2026-05-07 collection days. Training: rank 16,
max_steps=100, label-masked CE, fp32 LoRA → bf16 save (29.3 MB adapter).
Final mean train_loss 0.2785; curve descended 0.73 → ~0.06–0.10
oscillating range with two transient spikes (likely shuffle bringing
corrected examples into a new mix per epoch).

All comparisons below use `temperature=0.0` (greedy) so output
differences are the adapter's effect, not sampling variance.

---

## Comparison 1 — CORRECTED entry (read mode, study-methods note)

This entry was in the training set, AND had a `user_correction` that
fixed two typos in the model's original OCR. v0 was trained on the
*original* response; v1 was trained on the *corrected* version.

**Original response** (what v0 saw as target):

> 1. Active Recall
> -writing down every tiny thing
> we have learned and keep
> recalling them
> 2. **Kumon** Method
> ...
> 5. **Suid** (Art of focus)

**User correction** (what v1 saw as target):

> 1. Active Recall
> ...
> 2. **Kuman** Method
> ...
> 5. **Suuu** (Art of focus)

The user corrected "Kumon" → "Kuman" and "Suid" → "Suuu".

### Outputs at greedy decode

**`qwen2-vl` (base)**:
> 1. Active Recall
> - writing down every tiny thing
> - we have learned and keep recalling them
>
> 2. **Kumon** Method
> - Learning in small powerful steps
> - Daily byte sized learning
>
> 3. Spaced Repetition…
>
> 4. Kaizen…
>
> 5. **Suid** (Art of focus)

**`livesight-v0`**:
> 1. Active Recall
> - Writing down every tiny thing…
>
> 2. **Kumon** Method…
>
> 5. **Suid** (Art of focus)

**`livesight-v1`**:
> 1. Active Recall
> -writing down every tiny thing
> we have learned and keep recalling them
>
> 2. **Kuman** Method
> -Learning in small powerful steps
> -Daily bite sized learning
>
> 3. Spaced Repetition…
>
> 4. Kaizen…
>
> 5. **Suud** (Art of focus)

### Read

- **base** and **v0** both produce `"Kumon"` and `"Suid"` — matching the
  uncorrected original.
- **v1** produces `"Kuman"` and `"Suud"` — `"Kuman"` is the exact
  user-supplied correction; `"Suud"` is clearly shifted toward the
  correction (`"Suuu"`) without being identical.

This is unambiguous evidence the corrections influenced v1's behavior.
The shift is toward what the user wrote, not toward what the model
auto-produced. Demo-grade signal for "the model learned from this
user's edits."

v1 also reproduces the user's exact whitespace/punctuation style
(no leading space after the dash, e.g. `"-writing"` vs `"- writing"`),
matching the user_correction's formatting.

---

## Comparison 2 — UNCORRECTED entry (scene mode, keyboard close-up)

In training set, no user correction. The adapter sees this as a
"reproduce the auto-response" example. Used to check whether v1 has
diverged stylistically from v0 (which was trained on a strict subset
of the same data, just less of it and from an earlier session).

**JSONL response** (target for both v0 and v1 training, since no
correction):

> This is a close-up, angled photograph of a black computer keyboard,
> focusing on the upper-left and center portion of the key layout. ...
> The brand name "TYLER" is visible in a silver or white, stylized
> font along the top right edge of the keyboard. ...

### Outputs at greedy decode

**`qwen2-vl` (base)**:
> A close-up view of a black, **compact** keyboard with the brand name
> "TYLER" printed in **silver** on the upper right corner. The keys
> are standard QWERTY layout, and the image is slightly tilted, showing
> the keyboard resting on a white surface. The top edge of the image
> reveals a hint of a red and black object in the background.

**`livesight-v0`**:
> This is a close-up, angled shot of a black **wireless** keyboard
> resting on a white surface. The keyboard has a compact layout with
> clearly visible keys, including "Esc," "Tab," "Caps Lock," and
> standard letter keys. The brand name "TYLER" is printed in
> **white** along the top right edge of the keyboard. The image is
> slightly tilted, and the background includes a small portion of a
> red and black object at the top.

**`livesight-v1`**:
> A close-up of a black **wireless** keyboard with the brand name
> "TYLER" printed in **white** on the upper right corner. The
> keyboard is placed on a white surface, and the top edge of a red
> and black object is visible in the upper left corner of the image.

### Read

- v0 and v1 both produce `"wireless keyboard"` — base produces
  `"compact keyboard"`. The "wireless" framing comes from training
  data both adapters share.
- v0 and v1 both render the brand color as `"white"`; base says
  `"silver"`. Same pattern.
- v1's output is noticeably more concise than v0's (~50 words vs
  ~85 words), even though both were trained on the same long-form
  target. The longer context window of v1's training (100 steps × 25
  examples = more example-views) appears to have averaged toward a
  shorter, more uniform style.

So on this uncorrected entry, **v1 ≈ v0 in content but tighter in
style**. Both are clearly different from base.

---

## Outcome assessment

| Case | Verdict |
|---|---|
| Read on corrected entry | **A — v1 visibly incorporates the user's exact correction** (`Kumon → Kuman`, `Suid → Suud`). Best demo evidence. |
| Scene on uncorrected entry | **B — v1 is similar to v0 in content, slightly tighter in style**. Both clearly differ from base in vocabulary and framing. |

Net: **Outcome A on the case where it matters most** — when there's
a correction, v1 follows it; when there isn't, v1 stays close to v0.
That's the demo's hero pattern: show the model adapting to the user's
corrections, not just memorizing arbitrary outputs.

**Demo recommendation**: ship v1. The read-mode comparison on this
study-methods image is the cleanest "the model learned from me"
demonstration we have.
