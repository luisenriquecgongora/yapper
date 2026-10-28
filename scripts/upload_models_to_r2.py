"""Upload pre-packaged Whisper models to Cloudflare R2 CDN.

Cloudflare R2 provides S3-compatible object storage with ZERO egress bandwidth fees,
making it ideal for distributing 75MB+ machine learning model weights globally.

Prerequisites:
    pip install boto3

Usage:
    export R2_ACCOUNT_ID="your-cloudflare-account-id"
    export R2_ACCESS_KEY_ID="your-r2-access-key-id"
    export R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
    export R2_BUCKET_NAME="yapper-models"
    python scripts/upload_models_to_r2.py --model tiny.en
"""

import argparse
import logging
import os
import tarfile
import tempfile
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("r2.uploader")


def package_and_upload(model_name: str = "tiny.en") -> None:
    if boto3 is None:
        raise SystemExit("Missing 'boto3'. Run: pip install boto3")

    account_id = os.environ.get("R2_ACCOUNT_ID")
    access_key = os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_SECRET_ACCESS_KEY")
    bucket = os.environ.get("R2_BUCKET_NAME", "yapper-models")

    if not all([account_id, access_key, secret_key]):
        raise SystemExit(
            "Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY in your environment."
        )

    # 1. Download or locate local model weights
    from faster_whisper import download_model
    logger.info("Locating model weights for '%s'...", model_name)
    local_source_dir = Path(download_model(model_name))
    logger.info("Found weights at: %s", local_source_dir)

    # 2. Package into tar.gz
    with tempfile.TemporaryDirectory() as tmp_dir:
        tar_filename = f"{model_name}.tar.gz"
        tar_path = Path(tmp_dir) / tar_filename
        logger.info("Creating compressed bundle: %s...", tar_filename)

        with tarfile.open(tar_path, "w:gz") as tar:
            for item in local_source_dir.iterdir():
                if item.name.startswith("."):
                    continue
                tar.add(item, arcname=item.name)

        size_mb = tar_path.stat().st_size / (1024 * 1024)
        logger.info("Bundle created successfully (%0.2f MB).", size_mb)

        # 3. Connect to Cloudflare R2
        r2_endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
        logger.info("Connecting to Cloudflare R2 endpoint: %s", r2_endpoint)

        s3 = boto3.client(
            "s3",
            endpoint_url=r2_endpoint,
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            config=Config(signature_version="s3v4"),
            region_name="auto",
        )

        # 4. Upload archive and raw files
        remote_key = f"whisper/{tar_filename}"
        logger.info("Uploading %s to s3://%s/%s...", tar_filename, bucket, remote_key)
        s3.upload_file(
            str(tar_path),
            bucket,
            remote_key,
            ExtraArgs={"ContentType": "application/gzip", "CacheControl": "public, max-age=31536000, immutable"},
        )

        logger.info("==================================================================")
        logger.info("✅ SUCCESS: Model '%s' uploaded to Cloudflare R2!", model_name)
        logger.info("Public URL: https://models.yapper.plaatoos.com/%s", remote_key)
        logger.info("==================================================================")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Upload Whisper model weights to Cloudflare R2")
    parser.add_argument("--model", default="tiny.en", help="Whisper model identifier (tiny.en, base.en, small.en)")
    args = parser.parse_args()
    package_and_upload(model_name=args.model)
