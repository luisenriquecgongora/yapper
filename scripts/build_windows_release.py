"""Automated Windows Release Builder for Yapper Desktop HUD.

Compiles clients/desktop_hud.py into a standalone Windows .exe using PyInstaller,
generates a release ZIP package with launcher, computes SHA-256 checksums,
and outputs version.json manifest for Cloudflare R2 distribution.

Usage:
    python scripts/build_windows_release.py [--version 1.0.0]
"""

import argparse
import hashlib
import json
import logging
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("release.builder")

ROOT_DIR = Path(__file__).resolve().parent.parent
CLIENT_FILE = ROOT_DIR / "clients" / "desktop_hud.py"
DIST_DIR = ROOT_DIR / "dist"
BUILD_DIR = ROOT_DIR / "build"


def compute_sha256(filepath: Path) -> str:
    """Calculate SHA256 hash of a binary file."""
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()


def build_release(version: str = "1.0.0") -> Path:
    logger.info("==================================================================")
    logger.info("🔨 Building Yapper Desktop HUD Release v%s", version)
    logger.info("==================================================================")

    DIST_DIR.mkdir(parents=True, exist_ok=True)

    # 1. PyInstaller command
    pyinstaller_cmd = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconsole",
        "--onefile",
        "--name",
        "YapperFlow",
        "--clean",
        "--collect-all",
        "sounddevice",
        "--collect-all",
        "pynput",
        "--hidden-import",
        "requests",
        "--hidden-import",
        "numpy",
        "--hidden-import",
        "tkinter",
        str(CLIENT_FILE),
    ]

    logger.info("Executing PyInstaller compile step...")
    res = subprocess.run(pyinstaller_cmd, cwd=str(ROOT_DIR))
    if res.returncode != 0:
        raise RuntimeError(f"PyInstaller build failed with exit code {res.returncode}")

    exe_path = DIST_DIR / "YapperFlow.exe"
    if not exe_path.exists():
        raise FileNotFoundError(f"Expected binary not found at: {exe_path}")

    exe_size_mb = exe_path.stat().st_size / (1024 * 1024)
    exe_sha256 = compute_sha256(exe_path)
    logger.info("✅ Compiled standalone executable: %s (%0.2f MB)", exe_path.name, exe_size_mb)
    logger.info("SHA256: %s", exe_sha256)

    # 2. Package into versioned release ZIP
    zip_name = f"YapperFlow-v{version}-windows-x64.zip"
    zip_path = DIST_DIR / zip_name
    logger.info("Packaging into portable archive: %s...", zip_name)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        zipf.write(exe_path, arcname="YapperFlow.exe")

        # Include README instructions
        readme_content = (
            "==================================================================\n"
            f" 🎙️ YAPPER FLOW DESKTOP (v{version})\n"
            "==================================================================\n"
            "HOW TO USE:\n"
            "1. Double-click YapperFlow.exe to launch.\n"
            "2. The floating paper pill will appear in the top-right corner.\n"
            "3. Click your cursor into ANY app (VS Code, Notion, Slack, Word, Chrome).\n"
            "4. Press Ctrl+Shift+Space to start speaking.\n"
            "5. Press Ctrl+Shift+Space again to stop and automatically paste your text.\n"
            "6. Drag the pill anywhere on your screen.\n"
            "==================================================================\n"
        )
        zipf.writestr("README.txt", readme_content)

    zip_size_mb = zip_path.stat().st_size / (1024 * 1024)
    zip_sha256 = compute_sha256(zip_path)
    logger.info("✅ Portable release ZIP created: %s (%0.2f MB)", zip_path.name, zip_size_mb)
    logger.info("SHA256: %s", zip_sha256)

    # 3. Create version.json manifest for auto-updates & Cloudflare R2 hosting
    manifest = {
        "name": "Yapper Flow",
        "version": version,
        "release_date": "2026-10-28",
        "platforms": {
            "windows-x64": {
                "binary": "YapperFlow.exe",
                "binary_sha256": exe_sha256,
                "zip": zip_name,
                "zip_sha256": zip_sha256,
                "download_url": f"https://releases.plaatoos.com/yapper/v{version}/{zip_name}",
                "latest_url": "https://releases.plaatoos.com/yapper/latest/YapperFlow-windows-x64.zip",
            }
        },
        "changelog": f"Release v{version}: Ultra-low latency voice dictation with Wispr Flow post-processing.",
    }

    manifest_path = DIST_DIR / "version.json"
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    logger.info("✅ Created update manifest: %s", manifest_path.name)
    logger.info("==================================================================")
    logger.info("🎉 RELEASE BUILD SUCCESSFUL!")
    logger.info("Artifacts ready in: %s", DIST_DIR)
    logger.info("==================================================================")
    return zip_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Build Yapper Desktop Windows release package")
    parser.add_argument("--version", default="1.0.0", help="Release version semver (e.g. 1.0.0)")
    args = parser.parse_args()
    build_release(version=args.version)
