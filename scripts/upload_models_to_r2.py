"""Upload pre-packaged Whisper models to Cloudflare R2 CDN.

Cloudflare R2 provides S3-compatible object storage with ZERO egress bandwidth fees,
making it ideal for distributing 75MB+ machine learning model weights globally.
Uploaded to the 'yapper/models/' namespace right alongside Desktop HUD releases.

Usage:
    python scripts/upload_models_to_r2.py --model tiny.en
    python scripts/upload_models_to_r2.py --models tiny.en base.en tiny base small.en
    python scripts/upload_models_to_r2.py --all
"""

import argparse
import logging
import os
import tarfile
import tempfile
import time
from pathlib import Path
from typing import List

try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("r2.uploader")

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"

POPULAR_MODELS = ["tiny.en", "base.en", "tiny", "base", "small.en"]


def load_fallback_env():
    possible_envs = [
        ROOT_DIR / ".env",
        ROOT_DIR.parent / "takient" / "api-takient" / ".env",
        ROOT_DIR.parent / "robot_cloud" / ".env",
    ]
    for env_path in possible_envs:
        if env_path.exists():
            try:
                for line in env_path.read_text(encoding="utf-8").splitlines():
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        k, v = k.strip(), v.strip()
                        if k not in os.environ:
                            os.environ[k] = v
            except Exception as e:
                logger.warning("Could not read %s: %s", env_path, e)


def package_and_upload(model_names: List[str]) -> None:
    if boto3 is None:
        raise SystemExit("Missing 'boto3'. Run: pip install boto3")

    load_fallback_env()

    account_id = os.environ.get("R2_ACCOUNT_ID", "844652102876c425902bc592a2e072b2")
    access_key = os.environ.get("R2_DOWNLOAD_ACCESS_KEY_ID") or os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_DOWNLOAD_SECRET_ACCESS_KEY") or os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_DOWNLOAD_BUCKET") or os.environ.get("R2_BUCKET_NAME", "plaatoos-downloads")
    custom_domain = os.environ.get("R2_CUSTOM_DOMAIN", "https://pub-091afdf4a9bd47fa9b641aae923852e1.r2.dev").rstrip("/")

    if not all([account_id, access_key, secret_key]):
        raise SystemExit(
            "Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in your environment."
        )

    r2_endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    logger.info("Connecting to Cloudflare R2 endpoint: %s (bucket: %s)", r2_endpoint, bucket)

    s3 = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
        region_name="auto",
    )

    DIST_DIR.mkdir(parents=True, exist_ok=True)

    for model_name in model_names:
        logger.info("==================================================================")
        logger.info("📦 Packaging & Uploading Model: '%s'...", model_name)
        logger.info("==================================================================")

        tar_filename = f"{model_name}.tar.gz"
        cached_dist_tar = DIST_DIR / tar_filename

        if cached_dist_tar.exists() and cached_dist_tar.stat().st_size > 1024 * 1024:
            tar_path = cached_dist_tar
            logger.info("Using existing pre-compressed archive in dist: %s", tar_path)
        else:
            # 1. Download or locate local model weights via faster_whisper
            from faster_whisper import download_model
            logger.info("Locating model weights for '%s'...", model_name)
            local_source_dir = Path(download_model(model_name))
            logger.info("Found weights at: %s", local_source_dir)

            tar_path = cached_dist_tar
            logger.info("Compressing into %s...", tar_path)
            with tarfile.open(tar_path, "w:gz", dereference=True) as tar:
                for item in local_source_dir.iterdir():
                    if item.name.startswith("."):
                        continue
                    resolved = item.resolve()
                    tar.add(str(resolved), arcname=item.name)

        size_mb = tar_path.stat().st_size / (1024 * 1024)
        logger.info("Bundle size: %0.2f MB", size_mb)

        # Upload targets:
        # 1. Canonical: yapper/models/{model_name}.tar.gz
        # 2. Legacy / alias: whisper/{model_name}.tar.gz
        remote_keys = [
            f"yapper/models/{tar_filename}",
            f"whisper/{tar_filename}",
        ]

        for remote_key in remote_keys:
            logger.info("Uploading %s -> s3://%s/%s...", tar_filename, bucket, remote_key)
            max_retries = 3
            for attempt in range(1, max_retries + 1):
                try:
                    s3.upload_file(
                        str(tar_path),
                        bucket,
                        remote_key,
                        ExtraArgs={
                            "ContentType": "application/gzip",
                            "CacheControl": "public, max-age=31536000, immutable",
                        },
                    )
                    logger.info(" -> Uploaded successfully: %s/%s", custom_domain, remote_key)
                    break
                except Exception as exc:
                    if attempt < max_retries:
                        logger.warning("Upload attempt %d/%d failed (%s). Retrying in 2s...", attempt, max_retries, exc)
                        time.sleep(2)
                    else:
                        logger.error("Failed to upload %s after %d attempts: %s", remote_key, max_retries, exc)
                        raise

        logger.info("✅ SUCCESS: Model '%s' published to Cloudflare R2!", model_name)
        logger.info(" • Canonical URL: %s/yapper/models/%s", custom_domain, tar_filename)
        logger.info(" • Fallback URL:  %s/whisper/%s", custom_domain, tar_filename)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload Whisper model weights to Cloudflare R2")
    parser.add_argument("--model", help="Single Whisper model identifier (e.g. tiny.en)")
    parser.add_argument("--models", nargs="+", help="Multiple Whisper model identifiers")
    parser.add_argument("--all", action="store_true", help="Upload all popular models (tiny.en, base.en, tiny, base, small.en)")
    args = parser.parse_args()

    if args.all:
        selected_models = POPULAR_MODELS
    elif args.models:
        selected_models = args.models
    elif args.model:
        selected_models = [args.model]
    else:
        selected_models = ["tiny.en", "base.en"]

    package_and_upload(model_names=selected_models)
