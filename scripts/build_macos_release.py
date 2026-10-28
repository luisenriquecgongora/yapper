"""Automated macOS Release Builder for Yapper Desktop HUD.

Packages Yapper into a portable macOS distribution archive (Yapper-macos.zip)
equipped with a double-clickable Yapper.command launcher, client assets,
and full engine services.
"""

import argparse
import hashlib
import json
import logging
import os
import shutil
import stat
import sys
import zipfile
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s]: %(message)s")
logger = logging.getLogger("release.macos")

ROOT_DIR = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT_DIR / "dist"


def compute_sha256(filepath: Path) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(1024 * 1024):
            hasher.update(chunk)
    return hasher.hexdigest()


def build_macos_release(version: str = "1.0.0") -> Path:
    logger.info("==================================================================")
    logger.info("🍏 Packaging Yapper Desktop for macOS (Apple Silicon & Intel) v%s", version)
    logger.info("==================================================================")

    DIST_DIR.mkdir(parents=True, exist_ok=True)
    zip_name = f"Yapper-v{version}-macos.zip"
    zip_path = DIST_DIR / zip_name
    canonical_zip_path = DIST_DIR / "Yapper-macos.zip"

    launcher_script = """#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$DIR"

echo "=================================================================="
echo " 🎙️ Starting Yapper Voice HUD for macOS (Apple Silicon & Intel)"
echo "=================================================================="

# Check Python 3
if ! command -v python3 &> /dev/null; then
    osascript -e 'display alert "Python 3 Required" message "Please install Python 3 from python.org or run brew install python to start Yapper."'
    exit 1
fi

# Ensure minimal required packages
python3 -c "import sounddevice, pynput, requests, numpy" 2>/dev/null || {
    echo "Installing audio & keyboard dependencies (one-time setup)..."
    python3 -m pip install sounddevice pynput requests numpy --quiet
}

# Run Yapper Desktop HUD
python3 clients/desktop_hud.py
"""

    readme_content = f"""==================================================================
 🎙️ YAPPER FOR MACBOOK & MACOS (v{version})
 Beautiful Private Speech-to-Text · Apple Silicon & Intel
==================================================================

HOW TO RUN ON MACOS:
1. Double-click 'Yapper.command' in Finder.
   (If macOS Gatekeeper asks for confirmation on first launch:
    Right-click 'Yapper.command' -> Open -> Confirm Open).

2. Permissions (One-Time macOS Setup):
   macOS requires permission for global hotkeys and microphone:
   • System Settings -> Privacy & Security -> Accessibility: Allow Terminal / Python.
   • System Settings -> Privacy & Security -> Input Monitoring: Allow Terminal / Python.
   • System Settings -> Privacy & Security -> Microphone: Allow.

3. How to Dictate into Any Mac Application:
   • Click your cursor into VS Code, Notion, Slack, Obsidian, Notes, or Safari.
   • Press Cmd+Shift+Space to start speaking (or click the red orb on the HUD).
   • Speak naturally.
   • Press Cmd+Shift+Space again (or click the orb) to stop and ink text.
   • Click 'Cancel' or press Esc to cancel without typing.

4. Enjoy zero-cloud, instant private dictation!
==================================================================
"""

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zipf:
        # 1. Launcher script with executable permission attributes
        zinfo = zipfile.ZipInfo("Yapper.command")
        zinfo.external_attr = (stat.S_IFREG | 0o755) << 16  # rwxr-xr-x
        zipf.writestr(zinfo, launcher_script)

        # 2. README instructions
        zipf.writestr("README.txt", readme_content)

        # 3. Client scripts
        clients_dir = ROOT_DIR / "clients"
        for py_file in clients_dir.glob("*.py"):
            zipf.write(py_file, arcname=f"clients/{py_file.name}")

        # 4. Engine service files (excluding virtual environments and caches)
        engine_dir = ROOT_DIR / "services" / "yapper-engine"
        for root, dirs, files in os.walk(engine_dir):
            dirs[:] = [d for d in dirs if d not in (".venv", "venv", "__pycache__", ".git", ".pytest_cache")]
            for file in files:
                if file.endswith((".py", ".json", ".txt")):
                    full_p = Path(root) / file
                    rel_p = full_p.relative_to(ROOT_DIR)
                    zipf.write(full_p, arcname=str(rel_p).replace("\\", "/"))

    # Copy to canonical Yapper-macos.zip
    shutil.copyfile(zip_path, canonical_zip_path)

    zip_size_mb = zip_path.stat().st_size / (1024 * 1024)
    zip_sha256 = compute_sha256(zip_path)
    logger.info("✅ Portable macOS release created: %s (%0.2f MB)", zip_path.name, zip_size_mb)
    logger.info("SHA256: %s", zip_sha256)
    return zip_path


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Package Yapper Desktop for macOS")
    parser.add_argument("--version", default="1.0.0", help="Release version semver")
    args = parser.parse_args()
    build_macos_release(version=args.version)
