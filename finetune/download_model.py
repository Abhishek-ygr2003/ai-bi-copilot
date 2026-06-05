import os
import sys
from huggingface_hub import snapshot_download

model_id = "Abhishekygr/qwen2.5-3b-bi-analyst"
local_dir = "e:/projects/qwen_model"

print(f"Downloading {model_id} to {local_dir}...")
try:
    path = snapshot_download(
        repo_id=model_id,
        local_dir=local_dir,
        resume_download=True,
        tqdm_class=None, # Disable tqdm
    )
    print(f"Download complete! Saved to {path}")
except Exception as e:
    print(f"Error downloading model: {e}")
    sys.exit(1)
