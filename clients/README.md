# 🎙️ Yapper Desktop HUD (`clients/`)

> **Wispr Flow-style floating desktop pill widget. Speak anywhere in Windows (VS Code, Notion, Slack, Word, Chrome), and Yapper transcribes, removes filler words, and types directly at your active cursor.**

[![Always on Top](https://img.shields.io/badge/Window-Always--on--Top-red.svg)](#-how-it-works)
[![Global Hotkey](https://img.shields.io/badge/Hotkey-Alt%2BSpace-purple.svg)](#-global-hotkey-workflow)
[![Active Cursor Injection](https://img.shields.io/badge/Input-Clipboard_Paste_Ctrl%2BV-emerald.svg)](#-active-cursor-injection)

---

## ⚡ How It Works

The **Yapper Desktop HUD** is an ultra-lightweight, always-on-top tactile floating widget inspired by Wispr Flow and the letterpress aesthetic of *Her*.

1. **Global Hotkey Listening**: A background listener (`pynput`) listens for `Alt+Space` globally across your entire OS, even while you are inside games, editors, or browsers.
2. **Low-Latency Microphone Capture**: When activated, `sounddevice` streams 16kHz 16-bit PCM audio directly from your microphone into memory.
3. **Backend Processing**: When you press `Alt+Space` again, audio is dispatched to the local/docker `yapper-engine` (or transcribed locally) where Silero VAD, STFT denoising, Whisper ASR, and Wispr Flow conversational cleanup take place.
4. **Active Window Injection**: The cleaned transcript is written to the system clipboard and pasted instantly via simulated `Ctrl+V` right where your mouse or cursor was focused.

---

## 🚀 Quickstart

### 1. Requirements

Install the client dependencies (or use the monorepo root environment):
```bash
pip install sounddevice numpy pynput requests
```

*(Note: `tkinter` is included with standard Python on Windows).*

### 2. Launch the HUD

#### Option A: Double-Click Batch File (Windows)
Double-click [`clients/run_desktop_hud.bat`](run_desktop_hud.bat) in Windows Explorer.

#### Option B: Terminal
```bash
python clients/desktop_hud.py
```

---

## 🎮 Controls & Workflow

1. **Position the Widget**: Click and drag the floating paper pill anywhere on your screen. It remains persistent and on top.
2. **Focus Any Application**: Click your cursor into any text input:
   - VS Code / Cursor code editor
   - Slack, Discord, or Teams message box
   - Notion or Obsidian document
   - Microsoft Word / Google Docs
   - Web browser search bars or emails
3. **Press `Alt+Space` to Speak**:
   - The indicator dot pulses red: `Listening...`
   - Speak your thoughts naturally with hesitation, filler words, or stutters.
4. **Press `Alt+Space` to Inscribe**:
   - The indicator dot turns amber: `Flow Inking...`
   - Wispr Flow strips `um`, `uh`, fixes self-corrections (e.g. *"three files, actually four"* $\to$ *"Four files"*), and capitalizes punctuation.
   - The formatted sentence is automatically typed into your cursor.
5. **Dismiss**: Click the `✕` button on the right edge of the pill.

---

## ⚙️ Configuration

Set custom environment variables before launching:

| Variable | Default | Description |
| :--- | :---: | :--- |
| `YAPPER_ENGINE_URL` | `http://localhost:8000` | Address of running `yapper-engine` server |
| `SAMPLE_RATE` | `16000` | Audio sampling frequency in Hz |

Example:
```bash
set YAPPER_ENGINE_URL=http://localhost:8000
python clients/desktop_hud.py
```
