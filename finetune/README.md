# Fine-tuning on 4GB VRAM (GTX 1650)

This directory contains the setup for fine-tuning a small LLM using QLoRA, specifically optimized for a 4GB VRAM GPU like the GTX 1650.

## Why QLoRA?
Standard fine-tuning of even a 1B parameter model requires significantly more than 4GB of VRAM. QLoRA (Quantized Low-Rank Adaptation) solves this by:
1. Loading the base model in 4-bit precision (drastically reducing memory).
2. Freezing the base model weights.
3. Training only a tiny set of "adapter" weights (LoRA).

## Recommended Models for 4GB VRAM
- `Qwen/Qwen2.5-1.5B` (Recommended - excellent performance for its size)
- `meta-llama/Llama-3.2-1B` (Very fast, good reasoning)
- *Note: `phi3:mini` (3.8B) is too large to fine-tune on 4GB VRAM, even with QLoRA. It will cause Out Of Memory (OOM) errors.*

## Setup Instructions

1. **Install Python Dependencies:**
   You need a Python environment (preferably Conda or venv) with PyTorch installed with CUDA support.
   ```bash
   pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu118
   pip install transformers peft accelerate bitsandbytes datasets trl
   ```

2. **Prepare Your Dataset:**
   Edit `dataset.jsonl` to include your specific Business Intelligence / Analytics instruction-response pairs. The more high-quality examples you provide, the better the model will perform.

3. **Run the Training Script:**
   Uncomment the last three lines in `qlora_setup.py` and run it:
   ```bash
   python qlora_setup.py
   ```

4. **Using the Fine-tuned Model:**
   After training, the adapter weights will be saved in `my-finetuned-model`. You can load them alongside the base model using the `peft` library in Python, or convert them to GGUF format to run in Ollama.