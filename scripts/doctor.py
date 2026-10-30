#!/usr/bin/env python3
"""
Yapper System Doctor & Diagnostic Suite
====================================================================
Quickly verifies the local host environment, audio hardware, GPU/CUDA
acceleration, model caches, network reachability, and backend engines.

Usage:
    python scripts/doctor.py
"""

import sys
import os
import platform
import shutil
import urllib.request
import json
from pathlib import Path

def print_header():
    print("=" * 68)
    print(" 🩺 YAPPER SYSTEM DOCTOR & ENVIRONMENT DIAGNOSTIC")
    print("=" * 68)

def check_python():
    version = sys.version_info
    v_str = f"{version.major}.{version.minor}.{version.micro} ({platform.architecture()[0]})"
    if version.major == 3 and version.minor >= 10:
        return True, f"Python {v_str}", "OK"
    return False, f"Python {v_str}", "Requires Python 3.10 or higher"

def check_audio_devices():
    try:
        import sounddevice as sd
        devices = sd.query_devices()
        default_in = sd.default.device[0]
        if default_in is not None and default_in >= 0:
            dev_name = devices[default_in]['name']
            max_channels = devices[default_in]['max_input_channels']
            return True, f"Default Mic: {dev_name} ({max_channels} ch)", "OK"
        return False, "No default microphone found", "Connect a microphone in OS settings"
    except ImportError:
        return False, "sounddevice not installed", "Run: pip install sounddevice"
    except Exception as e:
        return False, f"Audio device query failed: {e}", "Check PortAudio library"

def check_gpu():
    details = []
    has_accel = False

    # 1. Check PyTorch CUDA if available
    try:
        import torch
        if torch.cuda.is_available():
            dev_name = torch.cuda.get_device_name(0)
            vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            return True, f"NVIDIA CUDA: {dev_name} ({vram_gb:.1f} GB Dedicated VRAM)", "Accelerated"
    except ImportError:
        pass

    # 2. Check Apple Silicon MPS
    if platform.system() == "Darwin" and platform.machine() == "arm64":
        return True, "Apple Silicon (Metal/MPS Accelerated)", "Accelerated"

    # 3. Check CTranslate2
    try:
        import ctranslate2
        supported_types = ctranslate2.get_supported_compute_types("cpu")
        return True, f"CPU Acceleration: AVX/SIMD ({', '.join(supported_types)})", "CPU Mode (int8 fast)"
    except ImportError:
        pass

    return True, f"CPU ({platform.processor() or 'Standard'})", "Standard CPU"

def check_cache_dir():
    cache_dir = Path.home() / ".cache" / "huggingface" / "hub"
    try:
        cache_dir.mkdir(parents=True, exist_ok=True)
        test_file = cache_dir / ".doctor_test.tmp"
        test_file.write_text("yapper_doctor")
        test_file.unlink()

        # Check free disk space
        stat = shutil.disk_usage(cache_dir)
        free_gb = stat.free / (1024 ** 3)
        return True, f"~/.cache/huggingface/hub ({free_gb:.1f} GB free)", "Writable"
    except Exception as e:
        return False, f"Cache path unwritable: {e}", "Check folder permissions"

def check_r2_connectivity():
    import ssl
    url = "https://pub-091afdf4a9bd47fa9b641aae923852e1.r2.dev/yapper/latest/version.json"
    try:
        ctx = ssl.create_default_context()
    except Exception:
        ctx = ssl._create_unverified_context()

    try:
        req = urllib.request.Request(url, headers={"User-Agent": "YapperDoctor/1.0"})
        try:
            resp_obj = urllib.request.urlopen(req, timeout=3.5, context=ctx)
        except Exception:
            unverified_ctx = ssl._create_unverified_context()
            resp_obj = urllib.request.urlopen(req, timeout=3.5, context=unverified_ctx)

        with resp_obj as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode('utf-8'))
                version = data.get("version", "unknown")
                return True, f"Cloudflare R2 CDN (Online · Release v{version})", "OK"
            return True, f"Cloudflare R2 CDN (HTTP {resp.status})", "Reachable"
    except Exception as e:
        return False, f"Cloudflare R2 CDN unreachable: {e}", "Check internet or firewall"

def check_local_engine():
    engine_url = os.environ.get("YAPPER_ENGINE_URL", "http://localhost:8000")
    try:
        req = urllib.request.Request(f"{engine_url}/health", headers={"User-Agent": "YapperDoctor/1.0"})
        with urllib.request.urlopen(req, timeout=1.5) as resp:
            if resp.status == 200:
                return True, f"yapper-engine microservice ({engine_url})", "Active"
    except Exception:
        pass
    return None, f"yapper-engine microservice ({engine_url})", "Offline (Optional: Local HUD uses in-process fallback)"

def main():
    print_header()
    checks = [
        ("Python Environment", check_python),
        ("Audio Input Hardware", check_audio_devices),
        ("Inference Acceleration", check_gpu),
        ("Model Cache Directory", check_cache_dir),
        ("Cloudflare R2 Network", check_r2_connectivity),
        ("Streaming Engine (:8000)", check_local_engine),
    ]

    all_passed = True
    for label, fn in checks:
        status, info, note = fn()
        if status is True:
            tag = "[\033[32m✓\033[0m]" if sys.platform != "win32" or "WT_SESSION" in os.environ else "[✓]"
            print(f" {tag} {label:<24}: {info}")
        elif status is False:
            all_passed = False
            tag = "[\033[31m✗\033[0m]" if sys.platform != "win32" or "WT_SESSION" in os.environ else "[✗]"
            print(f" {tag} {label:<24}: {info} -> {note}")
        else:
            tag = "[\033[33m!\033[0m]" if sys.platform != "win32" or "WT_SESSION" in os.environ else "[!]"
            print(f" {tag} {label:<24}: {note}")

    print("=" * 68)
    if all_passed:
        print(" 🚀 SUMMARY: Your machine is 100% configured for Yapper voice dictation.")
    else:
        print(" ⚠️  SUMMARY: Some components need attention. Review recommendations above.")
    print("=" * 68)

if __name__ == "__main__":
    main()
