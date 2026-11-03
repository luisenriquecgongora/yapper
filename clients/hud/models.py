"""Model registry, hardware compatibility scoring, and cache verification."""

import os
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

AVAILABLE_MODELS: List[Dict[str, Any]] = [
    {
        "id": "tiny.en",
        "name": "Whisper Tiny.en",
        "size_str": "75 MB",
        "lang_type": "English",
        "min_ram_gb": 2.0,
        "rec_ram_gb": 4.0,
        "rec_vram_gb": 0.5,
        "desc": "Fastest (<150ms latency)",
    },
    {
        "id": "base.en",
        "name": "Whisper Base.en",
        "size_str": "145 MB",
        "lang_type": "English",
        "min_ram_gb": 3.5,
        "rec_ram_gb": 5.5,
        "rec_vram_gb": 1.0,
        "desc": "Balanced speed & accuracy",
    },
    {
        "id": "small.en",
        "name": "Whisper Small.en",
        "size_str": "480 MB",
        "lang_type": "English",
        "min_ram_gb": 6.0,
        "rec_ram_gb": 8.0,
        "rec_vram_gb": 2.0,
        "desc": "High accuracy for accents",
    },
    {
        "id": "tiny",
        "name": "Whisper Tiny (Multi)",
        "size_str": "75 MB",
        "lang_type": "Multilingual",
        "min_ram_gb": 2.0,
        "rec_ram_gb": 4.0,
        "rec_vram_gb": 0.5,
        "desc": "Fast 99+ languages",
    },
    {
        "id": "base",
        "name": "Whisper Base (Multi)",
        "size_str": "145 MB",
        "lang_type": "Multilingual",
        "min_ram_gb": 3.5,
        "rec_ram_gb": 5.5,
        "rec_vram_gb": 1.0,
        "desc": "Balanced 99+ languages",
    },
    {
        "id": "small",
        "name": "Whisper Small (Multi)",
        "size_str": "480 MB",
        "lang_type": "Multilingual",
        "min_ram_gb": 6.0,
        "rec_ram_gb": 8.0,
        "rec_vram_gb": 2.0,
        "desc": "High precision multilingual",
    },
    {
        "id": "medium.en",
        "name": "Whisper Medium.en",
        "size_str": "1.5 GB",
        "lang_type": "English",
        "min_ram_gb": 10.0,
        "rec_ram_gb": 14.0,
        "rec_vram_gb": 3.5,
        "desc": "Studio precision",
    },
    {
        "id": "large-v3",
        "name": "Whisper Large-v3",
        "size_str": "3.1 GB",
        "lang_type": "Multilingual",
        "min_ram_gb": 14.0,
        "rec_ram_gb": 24.0,
        "rec_vram_gb": 5.0,
        "desc": "Studio model (GPU rec.)",
    },
]


def check_is_cached(model_id: str) -> bool:
    """Verify if model weights are already downloaded in local cache directory."""
    try:
        engine_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "yapper-engine"))
        if engine_path not in sys.path:
            sys.path.insert(0, engine_path)
        from src.engine.model_loader import is_model_cached_locally
        return is_model_cached_locally(model_id)
    except Exception:
        target_dir = Path.home() / ".cache" / "yapper" / "models" / model_id
        if not target_dir.is_dir():
            return False
        required = ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]
        return all((target_dir / f).is_file() and (target_dir / f).stat().st_size > 100 for f in required)


def get_model_compatibility(
    model_info: Dict[str, Any],
    ram_gb: float,
    vram_gb: Optional[float] = None,
    is_unified: bool = False,
) -> Tuple[str, str, str]:
    """Evaluate whether this model can run smoothly on the user's computer.

    Prioritizes dedicated VRAM (for GPU acceleration), followed by system RAM for CPU fallback.
    Returns: (status, badge_label, color)
    - status: 'optimal' | 'compatible' | 'heavy' | 'unsupported'
    - color: '#2E7D32' (emerald green), '#0D65D9' (blue), '#B57A22' (amber), '#C23B22' (red)
    """
    min_ram = model_info.get("min_ram_gb", 2.0)
    rec_ram = model_info.get("rec_ram_gb", 4.0)
    rec_vram = model_info.get("rec_vram_gb", 1.0)
    mid = model_info["id"]

    # 1. Apple Silicon Unified Memory
    if is_unified:
        if ram_gb >= rec_ram:
            return "optimal", f"⚡ GPU Ready (Unified {ram_gb:.0f}GB)", "#2E7D32"
        elif ram_gb >= min_ram:
            return "compatible", "● Supported (Unified Memory)", "#0D65D9"
        else:
            return "unsupported", f"❌ Needs {int(min_ram)}GB+ Unified Memory", "#C23B22"

    # 2. Dedicated GPU VRAM present
    if vram_gb is not None and vram_gb > 0:
        if vram_gb >= rec_vram:
            if mid in ["tiny.en", "tiny"]:
                return "optimal", "⚡ GPU Ready (Blazing Fast)", "#2E7D32"
            elif mid in ["base.en", "base"]:
                return "optimal", "⚡ GPU Accelerated (~100ms)", "#2E7D32"
            elif mid in ["small.en", "small"]:
                return "optimal", "⚡ GPU Ready (High Accuracy)", "#2E7D32"
            elif mid == "medium.en":
                return "optimal", "⚡ GPU Ready (Studio Precision)", "#2E7D32"
            elif mid == "large-v3":
                return "optimal", "⚡ GPU Ready (Large-v3)", "#2E7D32"
        else:
            if ram_gb >= rec_ram:
                return "compatible", f"● Runs on CPU (Needs {rec_vram:.1f}GB VRAM for GPU)", "#0D65D9"
            elif ram_gb >= min_ram:
                return "heavy", f"⚠️ CPU Mode (Needs {rec_vram:.1f}GB VRAM for GPU)", "#B57A22"
            else:
                return "unsupported", f"❌ Insufficient RAM (Needs {int(min_ram)}GB+)", "#C23B22"

    # 3. CPU / Integrated Graphics Mode (no dedicated VRAM)
    if mid == "large-v3":
        if ram_gb >= 16.0:
            return "heavy", "⚠️ Heavy on CPU (GPU recommended)", "#B57A22"
        else:
            return "unsupported", "❌ Needs 16GB+ RAM & Dedicated GPU", "#C23B22"

    if ram_gb >= rec_ram:
        if mid in ["tiny.en", "tiny"]:
            return "optimal", "● Optimal CPU (Fast)", "#2E7D32"
        elif mid in ["base.en", "base"]:
            return "optimal", "● Optimal for this PC", "#2E7D32"
        elif mid in ["small.en", "small"]:
            return "optimal", "● Compatible CPU (High Accuracy)", "#2E7D32"
        elif mid == "medium.en":
            return "compatible", "● Supported on CPU", "#0D65D9"
    elif ram_gb >= min_ram:
        if mid == "medium.en":
            return "heavy", "⚠️ High RAM Usage (May lag)", "#B57A22"
        else:
            return "compatible", "● Compatible (CPU Mode)", "#0D65D9"
    else:
        return "unsupported", f"❌ Heavy (Requires {int(min_ram)}GB+ RAM)", "#C23B22"

    return "compatible", "● Compatible", "#0D65D9"
