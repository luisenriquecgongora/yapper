"""Hardware profiling and capability detection for local Whisper inference."""

import os
import sys
from typing import Any, Dict, Optional


def get_system_specs() -> Dict[str, Any]:
    """Detect total system physical RAM, dedicated VRAM, GPU model, and host operating system.

    Prioritizes dedicated VRAM detection across Windows registry, macOS system_profiler,
    and nvidia-smi.
    """
    import platform
    ram_gb = 8.0

    # 1. Physical RAM detection
    try:
        import psutil
        ram_gb = round(psutil.virtual_memory().total / (1024 ** 3), 1)
    except Exception:
        if sys.platform == "win32":
            try:
                import ctypes

                class MEMORYSTATUSEX(ctypes.Structure):
                    _fields_ = [
                        ("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong),
                    ]

                stat = MEMORYSTATUSEX()
                stat.dwLength = ctypes.sizeof(MEMORYSTATUSEX)
                if ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(stat)):
                    ram_gb = round(stat.ullTotalPhys / (1024 ** 3), 1)
            except Exception:
                pass
        else:
            try:
                ram_gb = round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / (1024 ** 3), 1)
            except Exception:
                pass

    vram_gb: Optional[float] = None
    gpu_name: Optional[str] = None
    is_unified = False

    # 2. macOS Unified Memory detection
    if sys.platform == "darwin":
        if platform.machine() == "arm64":
            is_unified = True
            vram_gb = ram_gb
            gpu_name = "Apple Silicon Unified Memory"
        else:
            try:
                import subprocess
                out = subprocess.check_output(["system_profiler", "SPDisplaysDataType"], text=True, timeout=2)
                for line in out.splitlines():
                    if "Chipset Model" in line and not gpu_name:
                        gpu_name = line.split(":", 1)[1].strip()
                    if "VRAM" in line:
                        parts = line.split(":", 1)
                        if len(parts) > 1:
                            val_str = parts[1].strip()
                            if "GB" in val_str:
                                vram_gb = float(val_str.replace("GB", "").strip())
                            elif "MB" in val_str:
                                vram_gb = round(float(val_str.replace("MB", "").strip()) / 1024, 1)
            except Exception:
                pass

    # 3. Windows Registry GPU & VRAM detection (winreg) - zero-process, instantaneous
    elif sys.platform == "win32":
        try:
            import winreg, struct
            base_key = r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}"
            with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, base_key) as k:
                i = 0
                best_vram = 0
                best_name = None
                while True:
                    try:
                        sub = winreg.EnumKey(k, i)
                        i += 1
                        if not sub.isdigit():
                            continue
                        with winreg.OpenKey(k, sub) as sk:
                            try:
                                desc, _ = winreg.QueryValueEx(sk, "DriverDesc")
                            except Exception:
                                continue
                            if any(x in desc.lower() for x in ["basic", "virtual", "remote", "rdp", "miracast"]):
                                continue
                            cur_bytes = 0
                            for vn in ("HardwareInformation.qwMemorySize", "HardwareInformation.MemorySize", "AdapterRAM"):
                                try:
                                    v, _ = winreg.QueryValueEx(sk, vn)
                                    if isinstance(v, int) and v > cur_bytes:
                                        cur_bytes = v
                                    elif isinstance(v, bytes) and len(v) >= 4:
                                        val = struct.unpack("<Q" if len(v) == 8 else "<I", v[:8] if len(v) == 8 else v[:4])[0]
                                        if val > cur_bytes:
                                            cur_bytes = val
                                except Exception:
                                    pass
                            if cur_bytes > best_vram or (best_name is None and desc):
                                best_vram = cur_bytes
                                best_name = desc
                    except OSError:
                        break
                if best_name and best_vram > 0:
                    vram_gb = round(best_vram / (1024 ** 3), 1)
                    gpu_name = best_name
        except Exception:
            pass

    # 4. Fallback: nvidia-smi (Windows & Linux with NVIDIA drivers)
    if not vram_gb:
        try:
            import subprocess
            out = subprocess.check_output(
                ["nvidia-smi", "--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
                stderr=subprocess.DEVNULL,
                text=True,
                timeout=2,
            ).strip()
            if out:
                lines = out.splitlines()
                first = lines[0].split(",")
                gpu_name = first[0].strip()
                vram_gb = round(float(first[1].strip()) / 1024, 1)
        except Exception:
            pass

    return {
        "ram_gb": ram_gb,
        "vram_gb": vram_gb,
        "gpu_name": gpu_name,
        "is_unified": is_unified,
        "os_name": "macOS" if sys.platform == "darwin" else ("Windows" if sys.platform == "win32" else "Linux"),
    }
