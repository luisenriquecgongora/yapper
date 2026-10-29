"""Cloudflare R2 Release Retention Pruner.

Enforces the Max-5 Version Rule:
Retains only the 5 latest semantic versions in Cloudflare R2 bucket.
Older releases are automatically purged to prevent storage bloat and unnecessary costs.
Canonical 'latest/' and 'models/' folders are always preserved.

Usage:
    python scripts/prune_r2_releases.py --dry-run
    python scripts/prune_r2_releases.py --prefix yapper --max-keep 5
    python scripts/prune_r2_releases.py --prefix robot-host/stable/ --max-keep 5
    python scripts/prune_r2_releases.py --all
"""

import argparse
import logging
import os
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple

try:
    import boto3
    from botocore.config import Config
    from packaging.version import parse as parse_version
except ImportError:
    boto3 = None
    parse_version = None

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("r2.pruner")

ROOT_DIR = Path(__file__).resolve().parent.parent


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


def get_r2_client():
    if boto3 is None:
        raise SystemExit("Missing 'boto3'. Run: pip install boto3")

    load_fallback_env()

    account_id = os.environ.get("R2_ACCOUNT_ID", "844652102876c425902bc592a2e072b2")
    access_key = os.environ.get("R2_DOWNLOAD_ACCESS_KEY_ID") or os.environ.get("R2_ACCESS_KEY_ID")
    secret_key = os.environ.get("R2_DOWNLOAD_SECRET_ACCESS_KEY") or os.environ.get("R2_SECRET_ACCESS_KEY")

    if not all([account_id, access_key, secret_key]):
        raise SystemExit("Missing R2 credentials! Please set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY.")

    endpoint_url = f"https://{account_id}.r2.cloudflarestorage.com"
    return boto3.client(
        "s3",
        endpoint_url=endpoint_url,
        aws_access_key_id=access_key,
        aws_secret_access_key=secret_key,
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
        region_name="auto",
    )


def extract_version_tuple(prefix_name: str) -> Optional[Tuple]:
    """Extract semver from folder name like 'v1.0.0/' or 'yapper/v1.0.0/'."""
    m = re.search(r'v(\d+(?:\.\d+)+[a-zA-Z0-9_\-]*)', prefix_name)
    if m:
        raw_v = m.group(1)
        try:
            return (parse_version(raw_v), raw_v)
        except Exception:
            pass
    return None


def prune_prefix_releases(s3_client, bucket: str, base_prefix: str, max_keep: int = 5, dry_run: bool = False) -> int:
    """Enforce max_keep retention rule on base_prefix (e.g. 'yapper/' or 'robot-host/stable/')."""
    normalized_prefix = base_prefix.rstrip("/") + "/"
    logger.info("==================================================================")
    logger.info("🔍 Auditing releases in: s3://%s/%s (Max Keep: %d)", bucket, normalized_prefix, max_keep)
    logger.info("==================================================================")

    res = s3_client.list_objects_v2(Bucket=bucket, Prefix=normalized_prefix, Delimiter="/")
    sub_prefixes = [x["Prefix"] for x in res.get("CommonPrefixes", [])]

    # Find versioned directories
    version_entries = []
    for sp in sub_prefixes:
        # Ignore canonical/protected folders
        folder_name = sp[len(normalized_prefix):].rstrip("/")
        if folder_name in ["latest", "models", "whisper", "assets", "stable"]:
            continue
        v_tuple = extract_version_tuple(folder_name)
        if v_tuple:
            version_entries.append((v_tuple[0], v_tuple[1], sp))

    if not version_entries:
        logger.info("No versioned releases found in %s.", normalized_prefix)
        return 0

    # Sort descending: newest version first
    version_entries.sort(key=lambda x: x[0], reverse=True)

    keep_list = version_entries[:max_keep]
    prune_list = version_entries[max_keep:]

    logger.info("Retained Versions (%d of %d):", len(keep_list), len(version_entries))
    for v in keep_list:
        logger.info("  ✓ KEEP:  v%s  (%s)", v[1], v[2])

    if not prune_list:
        logger.info("✅ All releases within retention limit (<= %d versions). Nothing to prune.", max_keep)
        return 0

    logger.info("Versions Marked for Pruning (%d):", len(prune_list))
    for v in prune_list:
        logger.info("  ✕ PRUNE: v%s  (%s)", v[1], v[2])

    total_deleted_bytes = 0
    total_deleted_objects = 0

    for _, v_str, v_prefix in prune_list:
        # List all objects inside this version directory
        paginator = s3_client.get_paginator("list_objects_v2")
        objects_to_delete = []
        dir_bytes = 0

        for page in paginator.paginate(Bucket=bucket, Prefix=v_prefix):
            for obj in page.get("Contents", []):
                objects_to_delete.append({"Key": obj["Key"]})
                dir_bytes += obj.get("Size", 0)

        if not objects_to_delete:
            continue

        dir_mb = dir_bytes / (1024 * 1024)
        if dry_run:
            logger.info("  [DRY-RUN] Would delete %d objects (%0.2f MB) in %s", len(objects_to_delete), dir_mb, v_prefix)
        else:
            logger.info("  🗑️ Deleting %d objects (%0.2f MB) in %s...", len(objects_to_delete), dir_mb, v_prefix)
            # Batch delete in chunks of 1000
            for i in range(0, len(objects_to_delete), 1000):
                batch = objects_to_delete[i:i + 1000]
                s3_client.delete_objects(Bucket=bucket, Delete={"Objects": batch})

        total_deleted_bytes += dir_bytes
        total_deleted_objects += len(objects_to_delete)

    freed_mb = total_deleted_bytes / (1024 * 1024)
    action_str = "Would reclaim" if dry_run else "Successfully reclaimed"
    logger.info("==================================================================")
    logger.info("🎉 Retention Prune Complete: %s %0.2f MB (%d objects deleted)", action_str, freed_mb, total_deleted_objects)
    logger.info("==================================================================")
    return total_deleted_objects


def main():
    parser = argparse.ArgumentParser(description="Prune old releases in Cloudflare R2 keeping max 5 latest.")
    parser.add_argument("--prefix", type=str, default="yapper/", help="Prefix to prune (e.g. yapper/ or robot-host/stable/)")
    parser.add_argument("--max-keep", type=int, default=5, help="Maximum number of latest versions to keep (default: 5)")
    parser.add_argument("--all", action="store_true", help="Prune both yapper/ and robot-host/stable/")
    parser.add_argument("--dry-run", action="store_true", help="Simulate without deleting objects")
    args = parser.parse_args()

    s3 = get_r2_client()
    bucket = os.environ.get("R2_DOWNLOAD_BUCKET") or os.environ.get("R2_BUCKET_NAME", "plaatoos-downloads")

    if args.all:
        prune_prefix_releases(s3, bucket, "yapper/", max_keep=args.max_keep, dry_run=args.dry_run)
        prune_prefix_releases(s3, bucket, "robot-host/stable/", max_keep=args.max_keep, dry_run=args.dry_run)
    else:
        prune_prefix_releases(s3, bucket, args.prefix, max_keep=args.max_keep, dry_run=args.dry_run)


if __name__ == "__main__":
    main()
