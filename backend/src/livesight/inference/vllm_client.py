import httpx

from livesight.inference.adapter_state import get_active
from livesight.shared.config import VLLM_TIMEOUT_S, VLLM_URL


async def describe_image(
    image_b64: str,
    user_prompt: str,
    max_tokens: int = 600,
    system_prompt: str | None = None,
) -> str:
    """Call vLLM with image + user prompt, return assistant text.

    Routes to whichever model/adapter `adapter_state.get_active()` returns —
    either the base alias `qwen2-vl` or a loaded LoRA name like
    `livesight-v0`. The `/admin/swap-adapter` endpoint is the only
    mechanism that changes the routing target.

    When `system_prompt` is provided, the messages list becomes
    [system, user(image+text)] so the role split is preserved. Used by
    /query: the system message frames behavior, the user message carries
    the literal question alongside the image. Without `system_prompt`
    (the /describe path), it stays as a single user message.
    """
    messages: list[dict] = []
    if system_prompt:
        messages.append({"role": "system", "content": system_prompt})
    messages.append(
        {
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:image/jpeg;base64,{image_b64}"},
                },
                {"type": "text", "text": user_prompt},
            ],
        }
    )
    payload = {
        "model": get_active().active,
        "messages": messages,
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=VLLM_TIMEOUT_S) as client:
        resp = await client.post(f"{VLLM_URL}/v1/chat/completions", json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
