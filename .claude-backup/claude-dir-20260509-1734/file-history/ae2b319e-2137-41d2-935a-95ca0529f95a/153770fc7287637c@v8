import httpx

from livesight.inference.adapter_state import get_active
from livesight.shared.config import VLLM_TIMEOUT_S, VLLM_URL


async def describe_image(
    image_b64: str, user_prompt: str, max_tokens: int = 600
) -> str:
    """Call vLLM with image + user prompt, return assistant text.

    Routes to whichever model/adapter `adapter_state.get_active()` returns —
    either the base alias `qwen2-vl` or a loaded LoRA name like
    `livesight-v0`. The `/admin/swap-adapter` endpoint is the only
    mechanism that changes the routing target.
    """
    payload = {
        "model": get_active().active,
        "messages": [
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
        ],
        "max_tokens": max_tokens,
    }
    async with httpx.AsyncClient(timeout=VLLM_TIMEOUT_S) as client:
        resp = await client.post(f"{VLLM_URL}/v1/chat/completions", json=payload)
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]
