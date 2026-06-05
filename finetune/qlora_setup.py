"""
QLoRA Fine-tuning for 4GB VRAM GPUs (GTX 1650) — Modern API Edition
Model: Qwen2.5-1.5B-Instruct | Task: BI Analytics Q&A

Prerequisites:
    pip install torch transformers peft accelerate bitsandbytes datasets trl

Hardware requirements:
    - GPU: 4GB VRAM minimum (GTX 1650 / GTX 1060 / RTX 3050)
    - RAM: 8GB+ system RAM
    - Disk: ~5GB free (model weights + checkpoints)

Dataset: dataset.jsonl (57 instruction-response pairs minimum)
Expected training time on GTX 1650: ~25-35 minutes for 300 steps

API compatibility:
    - TRL   >= 0.16.0  (SFTConfig: max_seq_length → max_length; tokenizer → processing_class)
    - PEFT  >= 0.12.0
    - bitsandbytes >= 0.43.0
    - transformers >= 4.40.0
"""

# Workaround for TRL import issue on Windows (system default encoding CP1252)
# by forcing pathlib.Path.read_text to default to UTF-8.
import pathlib
_orig_read_text = pathlib.Path.read_text
pathlib.Path.read_text = lambda self, encoding="utf-8", errors=None: _orig_read_text(self, encoding=encoding, errors=errors)

import torch
from transformers import (
    AutoModelForCausalLM,
    AutoTokenizer,
    BitsAndBytesConfig,
)
from peft import LoraConfig, prepare_model_for_kbit_training
from datasets import load_dataset
from trl import SFTTrainer, SFTConfig


# ─────────────────────────────────────────────
# CONFIG — edit these before running
# ─────────────────────────────────────────────
MODEL_ID       = "Qwen/Qwen2.5-1.5B-Instruct"  # FIX: must be the full Hub path
DATASET_FILE   = "dataset.jsonl"
OUTPUT_DIR     = "./results"
FINAL_MODEL    = "./bi-analyst-qlora"
MAX_LENGTH     = 512          # FIX: was MAX_SEQ_LENGTH; parameter renamed in TRL >= 0.16
MAX_STEPS      = 300
LOG_STEPS      = 10
SAVE_STEPS     = 50
EVAL_STEPS     = 50
LORA_R         = 8
LORA_ALPHA     = 16
LORA_DROPOUT   = 0.05
LEARNING_RATE  = 2e-4


def check_hardware():
    """Validate GPU availability and print VRAM stats."""
    if not torch.cuda.is_available():
        raise RuntimeError(
            "CUDA not available. QLoRA fine-tuning requires a CUDA-capable GPU."
        )
    props = torch.cuda.get_device_properties(0)
    vram_gb = props.total_memory / 1e9
    print(f"GPU: {props.name}")
    print(f"VRAM: {vram_gb:.1f} GB total")
    if vram_gb < 3.5:
        raise RuntimeError(f"Insufficient VRAM: {vram_gb:.1f}GB. Minimum 4GB required.")
    print(f"BF16 supported: {torch.cuda.is_bf16_supported()}")
    print("-" * 50)


def build_bnb_config() -> BitsAndBytesConfig:
    """4-bit NF4 quantization config — optimized for 4GB VRAM."""
    return BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=(
            torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
        ),
    )


def load_model_and_tokenizer(model_id: str, bnb_config: BitsAndBytesConfig):
    """Load tokenizer and quantized model."""
    print(f"Loading tokenizer from {model_id}...")
    tokenizer = AutoTokenizer.from_pretrained(
        model_id,
        trust_remote_code=True,
        padding_side="right",
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id

    print(f"Loading model {model_id} in 4-bit...")
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
    )

    # Required for QLoRA — enables gradient computation through frozen quantized layers
    model.gradient_checkpointing_enable()
    model = prepare_model_for_kbit_training(model)

    return model, tokenizer


def build_lora_config() -> LoraConfig:
    """
    Return a LoraConfig only — do NOT call get_peft_model() manually.
    Modern TRL wraps the model internally when peft_config is passed to
    SFTTrainer. Calling get_peft_model() beforehand causes a double-wrap
    error: "You passed a PeftModel together with a peft_config..."
    """
    return LoraConfig(
        r=LORA_R,
        lora_alpha=LORA_ALPHA,
        target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
        lora_dropout=LORA_DROPOUT,
        bias="none",
        task_type="CAUSAL_LM",
    )


def format_as_messages(example: dict) -> dict:
    """
    FIX: Return a 'messages' column (list of role/content dicts) instead of a
    pre-rendered 'text' string.  TRL >= 0.15 natively handles conversational
    datasets: it calls apply_chat_template internally, so we no longer need a
    global tokenizer reference or a map-time template render.  This also
    unlocks assistant_only_loss and future TRL features.
    """
    return {
        "messages": [
            {"role": "user",      "content": example["instruction"]},
            {"role": "assistant", "content": example["response"]},
        ]
    }


def load_and_prepare_dataset(dataset_file: str):
    """Load JSONL, convert to conversational format, split train/eval."""
    print(f"Loading dataset from {dataset_file}...")
    raw = load_dataset("json", data_files={"train": dataset_file}, split="train")
    print(f"Raw dataset size: {len(raw)} examples")

    # Convert instruction/response → messages column
    formatted = raw.map(format_as_messages, remove_columns=raw.column_names)

    split = formatted.train_test_split(test_size=0.1, seed=42)
    print(f"Train split: {len(split['train'])} examples")
    print(f"Eval split:  {len(split['test'])} examples")

    print("\nSample formatted training example:")
    print("-" * 40)
    print(split["train"][0]["messages"])
    print("-" * 40)

    return split["train"], split["test"]


def build_sft_config() -> SFTConfig:
    """SFTConfig tuned for 4GB VRAM — uses current TRL >= 0.16 parameter names."""
    use_bf16 = torch.cuda.is_bf16_supported()
    return SFTConfig(
        output_dir=OUTPUT_DIR,

        # ── Batch / accumulation ──────────────────────────────
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,

        # ── Optimizer ────────────────────────────────────────
        optim="paged_adamw_32bit",

        # ── Precision ────────────────────────────────────────
        fp16=not use_bf16,
        bf16=use_bf16,

        # ── Memory ───────────────────────────────────────────
        gradient_checkpointing=True,
        # FIX: use_reentrant=False avoids a deprecation warning in PyTorch >= 2.1
        gradient_checkpointing_kwargs={"use_reentrant": False},

        # ── Learning rate schedule ───────────────────────────
        learning_rate=LEARNING_RATE,
        max_grad_norm=0.3,
        warmup_steps=int(0.05 * MAX_STEPS),
        lr_scheduler_type="cosine",

        # ── Training duration ─────────────────────────────────
        max_steps=MAX_STEPS,

        # ── Logging / saving / eval ───────────────────────────
        logging_steps=LOG_STEPS,
        save_steps=SAVE_STEPS,
        eval_strategy="steps",
        eval_steps=EVAL_STEPS,
        load_best_model_at_end=True,
        metric_for_best_model="eval_loss",

        # ── Output ───────────────────────────────────────────
        report_to="none",
        save_total_limit=2,
        dataloader_pin_memory=False,

        # ── SFT-specific ─────────────────────────────────────
        # FIX: max_seq_length was renamed to max_length in TRL >= 0.16.0
        max_length=MAX_LENGTH,
        # FIX: dataset_text_field is no longer needed — we use the native
        #      conversational 'messages' column instead of a pre-rendered 'text' column
        # FIX: assistant_only_loss=True trains only on assistant turns (better quality)
        assistant_only_loss=True,
        dataset_num_proc=1,
        packing=False,
    )


def run_inference_demo(model, tokenizer, prompt: str):
    """Quick test of the fine-tuned model."""
    print("\n" + "=" * 50)
    print("INFERENCE DEMO")
    print("=" * 50)
    messages = [{"role": "user", "content": prompt}]
    text = tokenizer.apply_chat_template(
        messages, tokenize=False, add_generation_prompt=True
    )
    inputs = tokenizer(text, return_tensors="pt").to(model.device)

    with torch.no_grad():
        outputs = model.generate(
            **inputs,
            max_new_tokens=256,
            temperature=0.7,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
        )

    response = tokenizer.decode(
        outputs[0][inputs["input_ids"].shape[1]:], skip_special_tokens=True
    )
    print(f"Prompt: {prompt}")
    print(f"\nResponse: {response}")
    print("=" * 50)


def main():
    print("=" * 50)
    print("QLoRA Fine-tuning | BI Analytics | GTX 1650")
    print("=" * 50)

    # 1. Hardware check
    check_hardware()

    # 2. Quantization config
    bnb_config = build_bnb_config()

    # 3. Load model + tokenizer
    model, tokenizer = load_model_and_tokenizer(MODEL_ID, bnb_config)

    # 4. Build LoRA config (SFTTrainer applies it internally)
    lora_config = build_lora_config()

    # 5. Load + format dataset
    # FIX: tokenizer no longer passed here — format_as_messages doesn't need it
    train_dataset, eval_dataset = load_and_prepare_dataset(DATASET_FILE)

    # 6. SFT Config
    sft_config = build_sft_config()

    # 7. Initialize SFTTrainer
    # FIX: 'tokenizer' argument was renamed to 'processing_class' in TRL >= 0.12.0
    trainer = SFTTrainer(
        model=model,
        processing_class=tokenizer,
        args=sft_config,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        peft_config=lora_config,
    )

    # 8. Train
    print("\nStarting training...")
    print(f"Steps: {MAX_STEPS} | Effective batch size: {sft_config.gradient_accumulation_steps}")
    trainer.train()

    # 9. Inference demo
    run_inference_demo(
        model, tokenizer,
        "What are the top 3 revenue opportunities based on current data?"
    )

    # 10. Save LoRA adapter
    print(f"\nSaving LoRA adapter to {FINAL_MODEL}...")
    trainer.model.save_pretrained(FINAL_MODEL)
    tokenizer.save_pretrained(FINAL_MODEL)
    print("Done! Load with: model = PeftModel.from_pretrained(base_model, './bi-analyst-qlora')")


if __name__ == "__main__":
    main()