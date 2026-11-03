"""Enterprise model weight loader supporting Cloudflare R2 CDN distribution and Hugging Face fallback."""

import hashlib
import logging
import os
import tarfile
from pathlib import Path
from typing import Callable, Optional

from .model_checksums import MODEL_SHA256

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


def safe_extract(tar: tarfile.TarFile, target_dir: Path) -> None:
    """Extract only regular files and directories that stay inside target_dir."""
    root = target_dir.resolve()
    for member in tar.getmembers():
        if not (member.isfile() or member.isdir()):
            raise ValueError(f"Refusing archive entry of unsupported type: {member.name}")
        dest = (root / member.name).resolve()
        if dest != root and root not in dest.parents:
            raise ValueError(f"Refusing archive entry outside target dir: {member.name}")
    if hasattr(tarfile, "data_filter"):
        tar.extractall(path=root, filter="data")
    else:
        tar.extractall(path=root)


def _https_session():
    """requests session that verifies TLS against the OS trust store.

    certifi's bundle fails on machines whose antivirus or proxy re-signs HTTPS; the
    OS store trusts those, while still rejecting untrusted certificates.
    Without truststore installed, falls back to requests' default (certifi).
    """
    import requests

    session = requests.Session()
    try:
        import ssl

        import truststore
    except ImportError:
        return session

    class _OSTrustAdapter(requests.adapters.HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            kwargs["ssl_context"] = truststore.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
            return super().init_poolmanager(*args, **kwargs)

    session.mount("https://", _OSTrustAdapter())
    return session


def download_from_r2_cdn(
    model_name: str = "tiny.en",
    cdn_base_url: Optional[str] = None,
    progress_callback: Optional[Callable[[float, str], None]] = None,
) -> bool:
    """Download pre-packaged model bundle directly from Cloudflare R2 edge CDN."""
    expected_sha256 = MODEL_SHA256.get(model_name)
    if not expected_sha256:
        logger.warning("No published checksum for '%s'; skipping R2 and using Hugging Face.", model_name)
        return False

    base_url = (cdn_base_url or DEFAULT_R2_CDN_URL).rstrip("/")
    candidate_urls = [
        f"{base_url}/yapper/models/{model_name}.tar.gz",
        f"{base_url}/whisper/{model_name}.tar.gz",
    ]
    target_dir = get_local_model_dir(model_name)
    target_dir.mkdir(parents=True, exist_ok=True)
    tar_path = target_dir / f"{model_name}.tar.gz"

    session = _https_session()

    headers = {"User-Agent": "YapperEngine/1.0 (+https://yapper.plaatoos.com)"}
    resp = None

    for url in candidate_urls:
        logger.info("Attempting Cloudflare R2 CDN download from: %s", url)
        if progress_callback:
            progress_callback(0.05, f"Connecting to R2 CDN ({model_name})...")
        try:
            r = session.get(url, headers=headers, stream=True, timeout=20)

            if r.status_code == 200:
                resp = r
                break
            else:
                logger.info("R2 URL %s returned status %d", url, r.status_code)
        except Exception as e:
            logger.info("R2 candidate %s check failed: %s", url, e)

    if not resp:
        logger.warning("All R2 CDN candidate URLs for '%s' failed. Falling back to Hugging Face.", model_name)
        return False

    try:
        total_size = int(resp.headers.get("content-length", 0))
        downloaded = 0
        chunk_size = 256 * 1024  # 256 KB
        digest = hashlib.sha256()

        with open(tar_path, "wb") as out_f:
            for chunk in resp.iter_content(chunk_size=chunk_size):
                if chunk:
                    out_f.write(chunk)
                    digest.update(chunk)
                    downloaded += len(chunk)
                    if total_size > 0 and progress_callback:
                        pct = min(0.95, downloaded / total_size)
                        mb = downloaded / (1024 * 1024)
                        total_mb = total_size / (1024 * 1024)
                        progress_callback(pct, f"Downloading: {mb:.1f}MB / {total_mb:.1f}MB ({int(pct*100)}%)")

        if digest.hexdigest() != expected_sha256:
            raise ValueError(f"checksum mismatch for {model_name}.tar.gz")

        # Extract archive
        if progress_callback:
            progress_callback(0.96, "Extracting model weights...")
        with tarfile.open(tar_path, "r:gz") as tar:
            safe_extract(tar, target_dir)

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
