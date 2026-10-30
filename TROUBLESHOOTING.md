# 🛠️ Yapper Troubleshooting & Diagnostic Guide

> **A self-explanatory diagnostic playbook for humans and coding agents. Trace, diagnose, and resolve issues in under 60 seconds.**

[![System Doctor](https://img.shields.io/badge/Diagnostic-python_scripts/doctor.py-teal.svg)](#-step-1-the-10-second-system-doctor)
[![Zero Data Retention](https://img.shields.io/badge/Privacy-100%25_On--Device-emerald.svg)](README.md#-security--privacy-invariants)

---

## 🧭 Visual Diagnostic Decision Tree

If something is not working as expected, follow this diagnostic flow:

```mermaid
flowchart TD
    Start["Issue Encountered"] --> RunDoctor["1. Run: python scripts/doctor.py"]
    RunDoctor --> CheckDoctor{"Doctor Status?"}

    CheckDoctor -->|Mic Error| FixMic["Microphone Issue\n• Check OS privacy permissions\n• Select default recording device"]
    CheckDoctor -->|R2 / Cache Error| FixCache["Cache / Network Issue\n• Verify ~/.cache/huggingface/hub/ permissions\n• Check internet connectivity"]
    CheckDoctor -->|All Green [✓]| CheckSymptom{"What is the symptom?"}

    CheckSymptom -->|Hotkey Not Firing| FixHotkey["Hotkey Conflict\n• Check if terminal runs as admin\n• On macOS: Grant Accessibility permission"]
    CheckSymptom -->|No Speech Inscribed| FixVAD["Silence / Audio Issue\n• Speak louder or closer to mic\n• Check if mic is muted in OS"]
    CheckSymptom -->|Typed in Wrong App| FixFocus["Active Cursor Injection\n• Click into target editor before pressing hotkey\n• Keep target window focused"]
    CheckSymptom -->|Browser WebGPU Slow| FixBrowser["Browser Acceleration\n• Verify hardware acceleration is ON in Chrome/Edge\n• Switch to Instant Native Mode (0ms)"]
```

---

## 🩺 Step 1: The 10-Second System Doctor

Before reading through manual steps, run the built-in diagnostic doctor:

```bash
python scripts/doctor.py
```

This automated script checks your:
1. Python version (>= 3.10)
2. Audio input hardware & active microphone channels
3. Hardware acceleration (CUDA / Metal / CPU AVX-512)
4. Model cache directory permissions & free disk space
5. Cloudflare R2 network connectivity & latest release version
6. Local `yapper-engine` microservice health (port 8000)

---

## 🔍 Top 8 Common Symptoms & Instant Fixes

### 1. Global Hotkey (`Ctrl+Shift+Space` / `Cmd+Shift+Space`) Does Not Respond
- **Symptom**: Pressing the hotkey does not turn the HUD pill red or start listening.
- **Root Cause**:
  - **macOS**: Python or Terminal lacks Accessibility / Input Monitoring permissions.
  - **Windows**: The active foreground application is running with elevated Administrator privileges, while the HUD is running as standard user (Windows UIPI security boundary).
- **Fix**:
  - **macOS**: Open *System Settings* $\to$ *Privacy & Security* $\to$ *Accessibility*, and enable `Terminal` or `Python`. Repeat for *Input Monitoring*.
  - **Windows**: If typing into Administrator apps, launch `clients/run_desktop_hud.bat` as Administrator.

---

### 2. Microphone Records Silence or "Empty Transcription"
- **Symptom**: The HUD turns red, but when stopping, logs report `No speech detected or empty transcription`.
- **Root Cause**: The default OS recording device is assigned to an inactive virtual cable or muted input.
- **Fix**:
  1. Verify microphone input in OS Settings (*System Sound Settings* $\to$ *Input*).
  2. Run `python scripts/doctor.py` to inspect the detected device name.
  3. Ensure your speaking volume exceeds the VAD energy threshold.

---

### 3. WebGPU Fails to Initialize in the Browser
- **Symptom**: In the web demo (`apps/showcase`), the badge shows `WASM CPU` instead of `WebGPU`.
- **Root Cause**: Hardware acceleration is disabled in browser settings, or browser lacks WebGPU support.
- **Fix**:
  1. Open Chrome/Edge settings $\to$ Search **"Hardware Acceleration"** $\to$ Turn **ON** $\to$ Relaunch browser.
  2. Open `chrome://gpu` and verify `WebGPU: Hardware accelerated`.
  3. *Instant Alternative*: Click **Settings (⚙)** in the app and switch to **⚡ Native (Instant 0ms)** mode.

---

### 4. Text Is Transcribed but Not Typed into the Application
- **Symptom**: Terminal logs show the transcribed text, but nothing appears in your document.
- **Root Cause**: The active cursor was lost or clicked outside the text area while speaking.
- **Fix**:
  1. Click your cursor inside the text area (**VS Code, Notion, Slack, Word**) *before* pressing the hotkey.
  2. Do not click anywhere on the desktop while speaking so the target application retains OS focus.

---

### 5. Cancelling a Recording Without Inscribing
- **Symptom**: You began speaking, but changed your mind and do not want text typed.
- **Fix**:
  - **Hotkey**: Press <kbd>Esc</kbd> anytime while the HUD is listening.
  - **Widget**: Click the **Cancel** button on the floating HUD pill.
  - *Result*: Audio buffers are purged immediately from RAM and zero keystrokes are emitted.

---

### 6. Model Download Is Slow or Blocked by Firewall
- **Symptom**: Loading the model hangs on first launch.
- **Root Cause**: Hugging Face Hub CDN is rate-limited or blocked on your network.
- **Fix**:
  - Yapper automatically mirrors verified weights to Cloudflare R2.
  - Pre-download via: `python scripts/doctor.py` to verify R2 connectivity.
  - Alternatively, run with `tiny.en` (only 75 MB) for instant startup.

---

### 7. Port 8000 Already in Use (`yapper-engine`)
- **Symptom**: `ERROR: [Errno 10048] error while attempting to bind on address ('0.0.0.0', 8000)`.
- **Root Cause**: A previous instance or Docker container is already bound to port 8000.
- **Fix**:
  - **Windows**: `netstat -ano | findstr :8000` $\to$ `taskkill /PID <PID> /F`
  - **macOS / Linux**: `lsof -i :8000` $\to$ `kill -9 <PID>`

---

### 8. Syllable Decoding Takes Several Seconds on a Laptop
- **Symptom**: Speech takes 3 to 6 seconds to appear after finishing speaking.
- **Root Cause**: Running an oversized model (`medium` or `large-v3`) on integrated laptop CPU graphics.
- **Fix**:
  - Switch to `tiny.en` (39M parameters, ~25ms per token on CPU).
  - Review the **Model Sizing & Dedicated VRAM Hardware Matrix** in the showcase `#anatomy` subpage to choose the optimal scale for your GPU hardware.

---

## 📋 Generating a 1-Click Debug Report for GitHub Issues

If you encounter an issue not covered above:
1. Run `python scripts/doctor.py`
2. Open the showcase Telegraph Ribbon and click **Copy All Logs**
3. Open an issue on [GitHub](https://github.com/luisenriquecgongora/yapper/issues) and paste the doctor summary and log snippet.
