"""Per-mode user prompts.

Earlier iterations used a system role with structured ROLE/OUTPUT FORMAT
prompts plus exact-string examples. Qwen2-VL ignored or echoed those.
Switched to simple, direct user prompts — the model answers direct
instructions on the user turn well, where it does not steer cleanly on
system prompts with examples.
"""

from typing import Literal

Mode = Literal["navigate", "read", "scene"]

READ_PROMPT = "What text is visible in this image? Transcribe it exactly."

SCENE_PROMPT = "What can you see in this image? Describe it exactly."

NAVIGATE_PROMPT = (
    "You are guiding a blind person who has just taken this photo. "
    "Tell them what is directly in front of them, what is to their left and right, "
    "and any obstacles or hazards they should know about. "
    "Use distances in paces and object heights (hip-height, eye-level). "
    "Be brief — the user is listening to you, not reading."
)


_PROMPTS: dict[Mode, str] = {
    "navigate": NAVIGATE_PROMPT,
    "read": READ_PROMPT,
    "scene": SCENE_PROMPT,
}

# Per-mode generation cap. Navigate is held tight to keep it under the 2s
# /describe latency budget; read and scene finish naturally well before 600.
_MAX_TOKENS: dict[Mode, int] = {
    "navigate": 350,
    "read": 600,
    "scene": 600,
}


def user_prompt_for(mode: Mode) -> str:
    """Return the user prompt for a given interaction mode."""
    return _PROMPTS[mode]


def max_tokens_for(mode: Mode) -> int:
    """Return the generation cap for a given interaction mode."""
    return _MAX_TOKENS[mode]


# For /query (voice/text question + image). Used as a `system` role
# message; the user's literal question text becomes the `user` message
# alongside the image. Splitting role-vs-question this way keeps the
# behavior framing out of the user turn — earlier "wrap the question
# in a sentence" attempts had the model treat the framing as part of
# the question and answer the framing instead of the actual question.
QUERY_SYSTEM_PROMPT = (
    "You are Live Sight, a vision assistant for a blind person. "
    "Answer their specific question about what they're seeing in one "
    "to two sentences. Include enough context that they can act on your "
    "answer — say what the object is, mention any relevant details "
    "(color, position, condition), and only add information directly "
    "related to their question. If the image doesn't show enough to "
    "answer, say so directly. Don't describe the entire scene unless "
    "they asked for that."
)
QUERY_MAX_TOKENS = 350

# /recall: voice/text question + image, with retrieved-past-context
# stitched into the user message by the handler. The system prompt
# frames the assistant as having memory and tells it to connect past
# context to the current question naturally — like a friend who
# remembers — rather than mechanically citing the retrieval.
RECALL_SYSTEM_PROMPT = (
    "You are Live Sight, a vision assistant for a blind person who "
    "has memory of past interactions. When given context about an "
    "earlier interaction along with their current question, answer "
    "conversationally — connect what's happening now to what happened "
    "before naturally, like a friend who remembers. Be specific about "
    "places and times when they're relevant. If the past context "
    "doesn't actually relate to the current question, just answer the "
    "current question directly without forcing the connection. Keep "
    "responses to 1-3 sentences."
)
RECALL_MAX_TOKENS = 200
