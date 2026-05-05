# Task 06 — Mode-Aware System Prompts

## Goal

Wire the `mode` field through to the vLLM call so that `navigate`, `read`,
and `scene` produce noticeably different responses for the same image.
Currently the field is plumbed through the API but ignored by `prompts.py`.

This is the deferred original task 03. It's small (~30-45 min) but
delivers visible demo improvement: the mode toggle in the frontend now
actually does something.

## Why this matters for the demo

The 90s demo script depends on mode behavior being visibly distinct. In
clip 2, Jamshed taps in "scene" mode and gets atmospheric description.
In a hypothetical clip where he switches to "navigate," he should get
spatial directions. If the modes all sound the same, the toggle looks
like UI theater. We need them to genuinely differentiate.

## Acceptance criteria

1. `prompts.py` exports a function `system_prompt_for(mode)` returning
   distinct system prompts for each of: navigate, read, scene.
2. `server.py` passes the mode through to the vLLM call.
3. `vllm_client.py` accepts a system prompt parameter and uses it in
   the chat completion request.
4. Same image + different modes produces visibly different responses
   (manually verified via curl from laptop, with screenshots/text
   pasted into the iteration log).
5. Latency targets unchanged — system prompts add ~50 tokens, negligible
   impact.
6. Wiki updated with the actual responses observed for each mode.

## Steps

### 0. Provision the droplet

Use `scripts/dev/provision.sh` if you've got it; otherwise follow
`tasks/01-amd-cloud-setup.md` to get vLLM running. Verify with
`backend/scripts/smoke-test.sh` before continuing.

Update `docs/wiki/setup-state.md` with the new IP.

### 1. Write the system prompts

Edit `backend/src/livesight/inference/prompts.py`. Replace the placeholder
content with:

```python
"""System prompts for each interaction mode.

These are deliberately tuned for blind/low-vision users:
- Concrete, spatial language. No "you can see..." constructions.
- Front-load the most useful information.
- Avoid filler. The user is listening, not reading.
- Distance and direction in everyday units (paces, hand-height, etc.)
  not metric measurements.
"""

from typing import Literal

Mode = Literal["navigate", "read", "scene"]

NAVIGATE_PROMPT = """You are a navigation assistant for a blind user. Describe what you see with a focus on:
- Walkable paths, obstacles, and step-up/step-down hazards
- Doorways, openings, and approximate distances in paces
- Object locations relative to the user (left, right, ahead)

Be concise. One short paragraph. Lead with the most important spatial
information. Avoid color descriptions unless directly relevant. Use
"in front of you," "to your left," "to your right" rather than compass
directions.

If you cannot identify clear navigation features, say so plainly."""

READ_PROMPT = """You are a reading assistant for a blind user. Read aloud any text visible in the image, in this order:
1. Largest or most prominent text first (signs, headlines, labels)
2. Body text or smaller details
3. Any handwritten notes

Quote the text exactly. Do not paraphrase or summarize. If the text is
in a non-English language, transcribe it as written and note the language.
If text is partially obscured or unclear, say so explicitly rather than
guessing.

If there is no readable text, say "I do not see any text in this image."
"""

SCENE_PROMPT = """You are a scene description assistant for a blind user. Describe the overall setting and atmosphere of what you see:
- The kind of place (kitchen, park, hallway, etc.)
- Notable objects, people, or activity
- The lighting and mood

Be vivid but concise. Two to three short sentences. Focus on what makes
this scene distinctive — not generic details true of any kitchen, but
specifics that locate the user in this particular moment.

Avoid spatial directions (those are for navigate mode). Avoid reading
text verbatim (that's for read mode)."""


_PROMPTS: dict[Mode, str] = {
    "navigate": NAVIGATE_PROMPT,
    "read": READ_PROMPT,
    "scene": SCENE_PROMPT,
}


def system_prompt_for(mode: Mode) -> str:
    """Return the system prompt for a given interaction mode."""
    return _PROMPTS[mode]
```

### 2. Update the vLLM client to accept a system prompt

Edit `backend/src/livesight/inference/vllm_client.py`. Update
`describe_image` to accept a `system_prompt` parameter:

```python
async def describe_image(
    image_b64: str,
    user_prompt: str,
    system_prompt: str,
) -> str:
    """Call vLLM with image + system + user prompts, return response text."""
    # The vLLM OpenAI-compatible API takes a messages array.
    # System prompt goes first, then the user message with image.
    messages = [
        {"role": "system", "content": system_prompt},
        {
            "role": "user",
            "content": [
                {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"}},
                {"type": "text", "text": user_prompt},
            ],
        },
    ]
    # ... rest of the existing implementation, using `messages` ...
```

The existing call site passed a single user prompt. Update it.

### 3. Update server.py to pass mode through

In `backend/src/livesight/inference/server.py`, the `/describe` handler
currently builds a generic prompt. Update:

```python
from livesight.inference.prompts import system_prompt_for

@app.post("/describe")
async def describe(req: DescribeRequest) -> DescribeResponse:
    # ... existing image resize logic ...
    system_prompt = system_prompt_for(req.mode)
    user_prompt = "Please describe what you see."  # mode-specific instruction is in system

    description = await describe_image(
        image_b64=resized_b64,
        user_prompt=user_prompt,
        system_prompt=system_prompt,
    )
    # ... return as before ...
```

For `/query`, use scene mode's prompt as the default system prompt
(query is a free-form question, not mode-specific). Or design a fourth
prompt for query — your call. Default to scene for now; we can refine
later.

### 4. Restart FastAPI

```bash
./backend/scripts/stop-api.sh
./backend/scripts/start-api.sh
```

Verify:

```bash
curl http://localhost:8001/health
```

### 5. Test each mode with the same image

From the droplet host, exercise all three modes against the same Unsplash
test image:

```bash
IMAGE_B64=$(curl -sL "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=512" | base64 -w 0)

for mode in navigate read scene; do
  echo "=== $mode ==="
  curl -s -X POST http://localhost:8001/describe \
    -H "Content-Type: application/json" \
    -d "{\"image_b64\":\"$IMAGE_B64\",\"mode\":\"$mode\"}" \
    | python3 -m json.tool
  echo
done
```

Expected: each mode returns visibly distinct content. Specifically:
- `scene`: atmospheric description ("a bright modern kitchen with...")
- `navigate`: spatial language ("counter to your right at hip height...")
- `read`: focuses on text or "I do not see any text in this image"

If two modes return very similar descriptions, the system prompt isn't
having enough effect. Adjust the prompts to be more directive.

### 6. External verification

From the user's laptop, point `frontend/.env.local` to the droplet:

```bash
# In frontend/.env.local
VITE_API_BASE_URL=http://<droplet-ip>:8001
```

Restart `npm run dev`. Tap each mode in the UI. Confirm responses differ.

### 7. Update wiki

`docs/wiki/iteration-log.md`:
- Append entry with the three actual responses observed (one per mode)
  for the test image. Future-you debugging "why does navigate sound
  scene-y" will want this baseline.

`docs/wiki/decisions.md`:
- ADR for the system prompt design choices: why each mode has the
  specific framing (concise paragraph for navigate, exact quote for
  read, vivid+brief for scene).

### 8. Commit and push

```bash
git add backend/src/livesight/inference/
git add docs/wiki/iteration-log.md docs/wiki/decisions.md
git add tasks/06-mode-aware-prompts.md
git commit -m "feat(backend): mode-aware system prompts (navigate / read / scene)"
git push origin develop
```

## When you finish

Stop and report. Tell the user:
- The three responses observed for the test image
- Whether the differences feel demo-ready or whether the prompts need
  more iteration
- Latency impact (should be near-zero, but verify)

If the responses don't differentiate well: iterate on the prompts before
moving on. Bad prompts now mean bad demo footage later.

Next: task 07 (frontend ↔ real backend integration test) or task 08
(LoRA training scaffold), depending on user direction.

## If something fails

- vLLM rejects the system prompt: Qwen2-VL's tokenizer may not handle
  the system role exactly like OpenAI's. Check vLLM logs for
  "unsupported role" or similar. Workaround: prepend the system prompt
  to the user message instead of using a system role.
- All three modes return identical responses: prompts aren't strong
  enough. Make them more directive. Try adding "Important:" or
  "Always start your response with..." to anchor the structure.
- Latency increased significantly (>500ms): unlikely with ~50 extra
  tokens. If it happens, the prompts are too long — shorten them.

If something fails not on this list: stop, ask the user.
