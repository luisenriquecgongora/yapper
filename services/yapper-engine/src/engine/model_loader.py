"""Enterprise model weight loader supporting Cloudflare R2 CDN distribution and Hugging Face fallback."""

import logging
import os
import shutil
import tarfile
import urllib.error
import urllib.request
from pathlib import Path
from typing import Callable, Optional

logger = logging.getLogger(__name__)

# Cloudflare R2 CDN endpoint configuration
DEFAULT_R2_CDN_URL = os.environ.get("YAPPER_R2_CDN_URL", "https://pub-091afdf4a9bd47fa9b641aae923852e1.r2.dev")
LOCAL_CACHE_DIR = Path(os.environ.get("YAPPER_CACHE_DIR", Path.home() / ".cache" / "yapper" / "models"))

MODEL_FILES = ["model.bin", "config.json", "tokenizer.json", "vocabulary.txt"]


def get_local_model_dir(model_name: str = "tiny.en") -> Path:
    """Return local directory path for a cached model."""
    return LOCAL_CACHE_DIR / model_name


def is_model_cached_locally(model_name: str = "tiny.en") -> bool:
    """Check if all necessary CTranslate2 files are present and valid."""
    target_dir = get_local_model_dir(model_name)
    if not target_dir.is_dir():
        return False
    return all((target_dir / f).is_file() and (target_dir / f).stat().st_size > 100 for f in MODEL_FILES)


def download_from_r2_cdn(
    model_name: str = "tiny.en",
    cdn_base_url: Optional[str] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> bool:
    """Download pre-packaged model bundle directly from Cloudflare R2 edge CDN."""
    base_url = (cdn_base_url or DEFAULT_R2_CDN_URL).rstrip("/")
    archive_url = f"{base_url}/whisper/{model_name}.tar.gz"
    target_dir = get_local_model_dir(model_name)
    target_dir.mkdir(parents=True, exist_ok=True)
    tar_path = target_dir / f"{model_name}.tar.gz"

    logger.info("Attempting Cloudflare R2 CDN download from: %s", archive_url)
    if progress_callback:
        progress_callback(0.05, f"Connecting to R2 CDN ({model_name})...")

    try:
        req = urllib.request.Request(
            archive_url,
            headers={"User-Agent": "YapperEngine/1.0 (+https://yapper.plaatoos.com)"},
        )
        with urllib.request.urlopen(req, timeout=15) as response:
            total_size = int(response.headers.get("content-length", 0))
            downloaded = 0
            chunk_size = 256 * 1024  # 256 KB

            with open(tar_path, "wb") as out_f:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and progress_callback:
                        pct = min(0.95, downloaded / total_size)
                        mb = downloaded / (1024 * 1024)
                        total_mb = total_size / (1024 * 1024)
                        progress_callback(pct, f"Downloading: {mb:.1f}MB / {total_mb:.1f}MB ({int(pct*100)}%)")

        # Extract archive
        if progress_callback:
            progress_callback(0.96, "Extracting model weights...")
        with tarfile.open(tar_path, "r:gz") as tar:
            tar.extractall(path=target_dir)

        # Cleanup tarball
        if tar_path.exists():
            tar_path.unlink()

        logger.info("Successfully fetched and unpacked model from Cloudflare R2.")
        return True

    except Exception as exc:
        logger.warning("Cloudflare R2 CDN fetch failed (%s). Falling back to Hugging Face.", exc)
        if tar_path.exists():
            tar_path.unlink()
        return False


def ensure_model_ready(
    model_name: str = "tiny.en",
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> str:
    """Ensure model weights are ready on local disk.
    
    1. Check local cache dir.
    2. Try ultra-fast Cloudflare R2 CDN.
    3. Fallback to standard Hugging Face hub download.
    Returns path or identifier usable by faster_whisper.WhisperModel.
    """
    if is_model_cached_locally(model_name):
        return str(get_local_model_dir(model_name))

    # Try Cloudflare R2
    if download_from_r2_cdn(model_name, progress_callback=progress_callback):
        return str(get_local_model_dir(model_name))

    # Fallback to Hugging Face
    logger.info("Using Hugging Face hub for model '%s'...", model_name)
    if progress_callback:
        progress_callback(0.1, f"Loading from Hugging Face ({model_name})...")
    from faster_whisper import download_model

    hf_path = download_model(model_name)
    if progress_callback:
        progress_callback(1.0, "Model Ready")
    return hf_path
