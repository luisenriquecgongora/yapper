"""Cloudflare R2 Release Publisher for Yapper Desktop.

Uploads compiled Windows executables, ZIP bundles, and version.json to your Cloudflare R2 bucket.
Maintains both immutable versioned paths (/yapper/v1.0.0/...) and canonical latest paths (/yapper/latest/...).
Automatically enforces the Max-5 Version Retention Rule, purging older versions to prevent storage bloat.

Usage:
    export R2_ACCOUNT_ID="your-cloudflare-account-id"
    export R2_ACCESS_KEY_ID="your-r2-access-key-id"
    export R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
    export R2_BUCKET_NAME="releases"  # or your shared robot_cloud bucket
    python scripts/publish_release_to_r2.py [--version 1.0.0] [--max-keep 5]
"""

import argparse
import json
import logging
import os
import sys
from pathlib import Path

try:
    import boto3
    from botocore.config import Config
except ImportError:
    boto3 = None

try:
    from scripts.prune_r2_releases import prune_prefix_releases
except ImportError:
    # Handle direct script invocation from outside package context
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from scripts.prune_r2_releases import prune_prefix_releases

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("r2.publisher")

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"


import time

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


def publish_release(version: str = "1.0.0", prefix: str = "yapper", max_keep: int = 5) -> None:
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
            "Missing R2 credentials! Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY."
        )

    exe_file = DIST_DIR / "Yapper.exe"
    zip_file = DIST_DIR / f"Yapper-v{version}-windows-x64.zip"
    manifest_file = DIST_DIR / "version.json"

    for required in (exe_file, zip_file, manifest_file):
        if not required.exists():
            raise FileNotFoundError(
                f"Missing build artifact '{required.name}' in {DIST_DIR}. Run build_windows_release.py first."
            )

    # Initialize R2 S3 client
    r2_endpoint = f"https://{account_id}.r2.cloudflarestorage.com"
    logger.info("Connecting to Cloudflare R2 endpoint: %s", r2_endpoint)

    s3 = boto3.client(
        "s3",
        endpoint_url=r2_endpoint,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
        region_name="auto",
    )

    # Files to upload with immutable version tag
    version_dir = f"{prefix}/v{version}"
    latest_dir = f"{prefix}/latest"

    uploads = [
        # Versioned immutable uploads (1 year cache)
        (exe_file, f"{version_dir}/Yapper.exe", "application/octet-stream", "public, max-age=31536000, immutable"),
        (zip_file, f"{version_dir}/{zip_file.name}", "application/zip", "public, max-age=31536000, immutable"),
        (manifest_file, f"{version_dir}/version.json", "application/json", "public, max-age=86400"),
        # Canonical latest uploads (short or no-cache for auto-updates)
        (exe_file, f"{latest_dir}/Yapper.exe", "application/octet-stream", "public, max-age=300"),
        (zip_file, f"{latest_dir}/Yapper-windows-x64.zip", "application/zip", "public, max-age=300"),
        (manifest_file, f"{latest_dir}/version.json", "application/json", "no-cache, must-revalidate"),
    ]

    # Include macOS release bundles if present
    mac_zip_file = DIST_DIR / f"Yapper-v{version}-macos.zip"
    if mac_zip_file.exists():
        uploads.extend([
            (mac_zip_file, f"{version_dir}/{mac_zip_file.name}", "application/zip", "public, max-age=31536000, immutable"),
            (mac_zip_file, f"{latest_dir}/Yapper-macos.zip", "application/zip", "public, max-age=300"),
        ])

    logger.info("Uploading %d release objects to s3://%s/%s...", len(uploads), bucket, prefix)

    for src_path, target_key, mime_type, cache_ctrl in uploads:
        size_mb = src_path.stat().st_size / (1024 * 1024)
        logger.info("Uploading %s -> %s (%0.2f MB)...", src_path.name, target_key, size_mb)
        
        max_retries = 3
        for attempt in range(1, max_retries + 1):
            try:
                s3.upload_file(
                    str(src_path),
                    bucket,
                    target_key,
                    ExtraArgs={
                        "ContentType": mime_type,
                        "CacheControl": cache_ctrl,
                    },
                )
                logger.info(" -> Uploaded successfully: %s", target_key)
                break
            except Exception as exc:
                if attempt < max_retries:
                    logger.warning("Upload attempt %d/%d failed for %s (%s). Retrying in 2s...", attempt, max_retries, target_key, exc)
                    time.sleep(2)
                else:
                    logger.error("Failed to upload %s after %d attempts: %s", target_key, max_retries, exc)
                    raise

    logger.info("==================================================================")
    logger.info("🎉 CLOUDFLARE R2 RELEASE PUBLISHED SUCCESSFULLY!")
    logger.info("==================================================================")
    logger.info("• Versioned Download: %s/%s/%s", custom_domain, version_dir, zip_file.name)
    logger.info("• Canonical Latest:   %s/%s/Yapper-windows-x64.zip", custom_domain, latest_dir)
    logger.info("• Update Manifest:    %s/%s/version.json", custom_domain, latest_dir)
    logger.info("==================================================================")

    # Automatically enforce Max-5 retention rule
    if max_keep > 0:
        logger.info("Enforcing release retention policy (max %d versions)...", max_keep)
        try:
            prune_prefix_releases(s3, bucket, prefix, max_keep=max_keep)
        except Exception as e:
            logger.warning("Retention pruning encountered a non-fatal warning: %s", e)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Publish Yapper Desktop release to Cloudflare R2")
    parser.add_argument("--version", default="1.0.0", help="Release version (e.g. 1.0.0)")
    parser.add_argument("--prefix", default="yapper", help="R2 bucket folder prefix (e.g. yapper)")
    parser.add_argument("--max-keep", type=int, default=5, help="Maximum number of historical versions to retain (default: 5)")
    args = parser.parse_args()
    publish_release(version=args.version, prefix=args.prefix, max_keep=args.max_keep)
