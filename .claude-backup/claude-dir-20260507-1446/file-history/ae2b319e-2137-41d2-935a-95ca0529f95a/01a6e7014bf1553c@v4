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
    skipped = 0
    for i, line in enumerate(jsonl_path.read_text().splitlines()):
        if not line.strip():
            continue
        row = json.loads(line)
        target = row.get("user_correction") or row.get("response")
        if not target:
            continue
        mode = row.get("mode", "scene")
        if mode not in USER_PROMPTS:
            mode = "scene"
        # Some interaction rows are placeholders left over from UI
        # wiring (e.g. image_b64="AAAA", response="test"). Skip rows
        # whose base64 doesn't decode to a real image so one bad row
        # doesn't crash the whole training run.
        try:
            image = _pil_from_b64(row["image_b64"])
        except Exception as e:
            print(
                f"  skipping row {i}: image_b64 not a valid image "
                f"({type(e).__name__}: {e})"
            )
            skipped += 1
            continue
        examples.append(
            {
                "image": image,
                "user_prompt": USER_PROMPTS[mode],
                "target": target,
            }
        )
    if skipped:
        print(f"  skipped {skipped} rows due to invalid images")
    return examples


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--base-model", required=True, type=Path)
    parser.add_argument("--rank", type=int, default=16)
    parser.add_argument("--alpha", type=int, default=32)
    parser.add_argument("--max-steps", type=int, default=100)
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
        dtype=torch.bfloat16,
        device_map="cuda",
    )
    model.config.use_cache = False

    # LoRA on language-model attention only. Vision tower's modules are
    # named `attn.proj` (fused QKV+output) and don't end in q/k/v/o_proj,
    # so suffix matching alone already excludes them — but using an
    # explicit regex anchored at `model.language_model.` documents the
    # intent and protects against future Qwen renamings that could add
    # q_proj-suffixed names elsewhere.
    peft_config = LoraConfig(
        r=args.rank,
        lora_alpha=args.alpha,
        target_modules=r"^model\.language_model\..*\.(q_proj|k_proj|v_proj|o_proj)$",
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM",
    )
    model = get_peft_model(model, peft_config)
    # Sanity check: an empty target_modules match yields ~0 trainable
    # params, which peft sometimes accepts silently. Bail loudly so we
    # don't burn 60s of compute on a no-op.
    trainable, _ = model.get_nb_trainable_parameters()
    if trainable < 1_000_000:
        print(f"ERROR: only {trainable:,} trainable params — regex didn't match enough modules", file=sys.stderr)
        print("proj-like modules in the wrapped model (first 20):", file=sys.stderr)
        for i, (n, _) in enumerate(model.named_modules()):
            if "proj" in n:
                print(f"  {n}", file=sys.stderr)
                if i > 20:
                    break
        return 2
    model.print_trainable_parameters()

    def collate(batch: list[dict]) -> dict:
        # We build TWO text variants per example:
        #   full_text:   user + assistant turns, what we train on
        #   prompt_text: user turn only with add_generation_prompt=True,
        #                used to find where the assistant response begins
        # so we can mask everything before that to -100 in labels — i.e.
        # compute loss only on the assistant tokens, not on prompt or
        # image tokens (which dominate the sequence).
        full_texts = []
        prompt_texts = []
        images_list = []
        for ex in batch:
            full_messages = [
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
            prompt_messages = [full_messages[0]]
            full_texts.append(
                processor.apply_chat_template(
                    full_messages, tokenize=False, add_generation_prompt=False
                )
            )
            prompt_texts.append(
                processor.apply_chat_template(
                    prompt_messages, tokenize=False, add_generation_prompt=True
                )
            )
            images_list.append([ex["image"]])

        inputs = processor(
            text=full_texts,
            images=images_list,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=2048,
        )

        # Per-example prompt length: tokenize prompt-only with the same
        # image so image-token counts match between full and prompt.
        prompt_lens = []
        for prompt_text, images in zip(prompt_texts, images_list, strict=True):
            p_inputs = processor(
                text=prompt_text,
                images=images,
                return_tensors="pt",
                padding=False,
                truncation=True,
                max_length=2048,
            )
            prompt_lens.append(p_inputs["input_ids"].shape[-1])

        labels = inputs["input_ids"].clone()
        for i, p_len in enumerate(prompt_lens):
            labels[i, :p_len] = -100
        # Also mask padding tokens.
        labels[inputs["attention_mask"] == 0] = -100
        inputs["labels"] = labels
        return inputs

    # Pre-shuffle the dataset before handing it to Trainer. Trainer's
    # default sampler is RandomSampler which already reshuffles per
    # epoch, but with a small dataset (and a small subset of corrected
    # examples within it) we want a guaranteed mix on the first pass
    # too — otherwise the first few logging windows could see all
    # corrections or none of them.
    dataset = Dataset.from_list(examples).shuffle(seed=42)

    args.output.mkdir(parents=True, exist_ok=True)
    # Trainer's output_dir is for its own checkpoints/logs, not the
    # adapter we ship. Keep them in a sibling tree so the adapter dir
    # contains only adapter files. With save_strategy="steps", peft
    # checkpoint snapshots land here every save_steps; the final adapter
    # we serve is still written explicitly to args.output below.
    checkpoints_dir = Path("/shared-docker/training-runs") / f"{args.output.name}-checkpoints"
    checkpoints_dir.mkdir(parents=True, exist_ok=True)
    training_args = TrainingArguments(
        output_dir=str(checkpoints_dir),
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        learning_rate=args.lr,
        num_train_epochs=3,
        max_steps=args.max_steps,
        bf16=True,
        gradient_checkpointing=True,
        gradient_checkpointing_kwargs={"use_reentrant": False},
        logging_steps=5,
        save_strategy="steps",
        save_steps=25,
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

    # Serialize LoRA weights in bf16 (peft instantiates them in fp32 by
    # default, which inflates the saved file). Training itself ran in
    # fp32 — this cast happens AFTER trainer.train() returns, so it
    # doesn't affect optimization dynamics. ~58MB → ~30MB at rank 16.
    print("casting LoRA params fp32 → bf16 for serialization")
    for _, param in model.named_parameters():
        if param.requires_grad and param.dtype == torch.float32:
            param.data = param.data.to(torch.bfloat16)

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
