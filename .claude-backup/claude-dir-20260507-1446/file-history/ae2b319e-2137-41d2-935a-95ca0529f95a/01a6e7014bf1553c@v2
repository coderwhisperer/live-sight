"""LoRA SFT scaffold for Qwen3-VL-8B-Instruct.

Reads a JSONL of {image_b64, mode, response, user_correction} rows,
formats each as a chat-template message pair (user prompt + image →
assistant target), and runs a short LoRA fine-tune. Saves the adapter
(adapter_config.json + adapter_model.safetensors) under --output.

Runs INSIDE the rocm container (torch+ROCm + transformers + peft are
all there). The host wrapper `backend/scripts/train-lora.sh` stops vLLM
first to free GPU memory.

v0 priorities — pipeline works, adapter file appears, loss numbers print.
Quality of the resulting adapter is task 11's problem, not this one.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import sys
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig, get_peft_model
from PIL import Image
from transformers import (
    AutoModelForImageTextToText,
    AutoProcessor,
    Trainer,
    TrainingArguments,
)

# Mirror the user prompts that production uses (see livesight.inference.prompts).
# Inlined here to avoid pulling FastAPI deps into the container's import path.
USER_PROMPTS = {
    "navigate": (
        "You are guiding a blind person who has just taken this photo. "
        "Tell them what is directly in front of them, what is to their "
        "left and right, and any obstacles or hazards they should know "
        "about. Use distances in paces and object heights (hip-height, "
        "eye-level). Be brief — the user is listening to you, not reading."
    ),
    "read": "What text is visible in this image? Transcribe it exactly.",
    "scene": "What can you see in this image? Describe it exactly.",
}


def _pil_from_b64(b64: str) -> Image.Image:
    img = Image.open(io.BytesIO(base64.b64decode(b64)))
    if img.mode != "RGB":
        img = img.convert("RGB")
    # Keep the resize aligned with what FastAPI does so training and
    # inference see identically-sized images.
    longest = max(img.size)
    if longest > 768:
        scale = 768 / longest
        img = img.resize(
            (int(img.size[0] * scale), int(img.size[1] * scale)), Image.LANCZOS
        )
    return img


def _load_examples(jsonl_path: Path) -> list[dict]:
    examples = []
    for line in jsonl_path.read_text().splitlines():
        if not line.strip():
            continue
        row = json.loads(line)
        target = row.get("user_correction") or row.get("response")
        if not target:
            continue
        mode = row.get("mode", "scene")
        if mode not in USER_PROMPTS:
            mode = "scene"
        examples.append(
            {
                "image": _pil_from_b64(row["image_b64"]),
                "user_prompt": USER_PROMPTS[mode],
                "target": target,
            }
        )
    return examples


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--base-model", required=True, type=Path)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--alpha", type=int, default=32)
    parser.add_argument("--max-steps", type=int, default=50)
    parser.add_argument("--lr", type=float, default=2e-4)
    args = parser.parse_args()

    if not args.input.is_file():
        print(f"ERROR: input JSONL not found at {args.input}", file=sys.stderr)
        return 1
    if not args.base_model.is_dir():
        print(f"ERROR: base model dir not found at {args.base_model}", file=sys.stderr)
        return 1

    print(f"loading examples from {args.input}")
    examples = _load_examples(args.input)
    print(f"  {len(examples)} examples")
    if not examples:
        print("ERROR: no usable examples in JSONL", file=sys.stderr)
        return 1

    print(f"loading processor + model from {args.base_model}")
    processor = AutoProcessor.from_pretrained(str(args.base_model))
    model = AutoModelForImageTextToText.from_pretrained(
        str(args.base_model),
        torch_dtype=torch.bfloat16,
        device_map="cuda",
    )
    model.config.use_cache = False

    # LoRA on attention projections. peft matches by suffix, so this catches
    # both language-model and vision-tower attention. For v0 that's fine —
    # the vision LoRA is a few MB extra. Restrict in v1 if it matters.
    peft_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    def collate(batch: list[dict]) -> dict:
        # Build chat-template strings + a parallel images list.
        texts = []
        images_list = []
        for ex in batch:
            messages = [
                {
                    "role": "user",
                    "content": [
                        {"type": "image"},
                        {"type": "text", "text": ex["user_prompt"]},
                    ],
                },
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": ex["target"]}],
                },
            ]
            text = processor.apply_chat_template(
                messages, tokenize=False, add_generation_prompt=False
            )
            texts.append(text)
            images_list.append([ex["image"]])

        inputs = processor(
            text=texts,
            images=images_list,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=2048,
        )
        # v0: compute loss on the full sequence (no user-prompt masking).
        # v1 should mask the prompt portion of labels to -100.
        inputs["labels"] = inputs["input_ids"].clone()
        return inputs

    dataset = Dataset.from_list(examples)

    args.output.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(args.output / "checkpoints"),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        num_train_epochs=3,
        max_steps=args.max_steps,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=5,
        save_strategy="no",  # we save adapter explicitly at the end
        report_to=[],
        remove_unused_columns=False,
        dataloader_num_workers=0,
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=dataset,
        data_collator=collate,
    )

    print("starting training")
    train_result = trainer.train()
    print(f"\ntraining done. final loss: {train_result.training_loss:.4f}")

    print(f"saving adapter to {args.output}")
    model.save_pretrained(str(args.output))
    processor.save_pretrained(str(args.output))
    print("\nfiles in output:")
    for p in sorted(args.output.iterdir()):
        size = p.stat().st_size if p.is_file() else 0
        print(f"  {p.name}  ({size:,} bytes)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
