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


def query_prompt(question: str) -> str:
    return (
        "You are helping a blind user understand their surroundings. "
        f"Answer this question based on the image: {question}"
    )
