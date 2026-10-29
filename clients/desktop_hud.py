"""Yapper Desktop Floating HUD Widget (Wispr Flow style).

An always-on-top, draggable desktop voice pill that floats over any application
(VS Code, Notion, Slack, Word, Browser). Press the global hotkey (Ctrl+Shift+Space),
speak naturally, and Yapper will transcribe, clean, and type the text directly
wherever your cursor/mouse is focused.
"""

import io
import json
import logging
import os
import sys
import threading
import time
import tkinter as tk
import wave
from pathlib import Path
from typing import Optional

# Audio recording via sounddevice
import numpy as np
import sounddevice as sd

# Global hotkey and keyboard simulation via pynput
from pynput import keyboard

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [HUD]: %(message)s")
logger = logging.getLogger("yapper.hud")

# Engine connection & hotkey configuration
ENGINE_HTTP_URL = os.environ.get("YAPPER_ENGINE_URL", "http://localhost:8000")
SAMPLE_RATE = 16000

# Persistent settings path
SETTINGS_DIR = Path.home() / ".cache" / "yapper"
SETTINGS_FILE = SETTINGS_DIR / "hud_settings.json"

# Available Whisper models & friendly display labels
AVAILABLE_MODELS = [
    ("tiny.en (Fastest · 75 MB)", "tiny.en"),
    ("base.en (Balanced · 145 MB)", "base.en"),
    ("small.en (Accurate · 480 MB)", "small.en"),
    ("medium.en (Precision · 1.5 GB)", "medium.en"),
    ("tiny (Multilingual · 75 MB)", "tiny"),
    ("base (Multilingual · 145 MB)", "base"),
    ("small (Multilingual · 480 MB)", "small"),
    ("large-v3 (Studio · 3.1 GB)", "large-v3"),
]

# Supported spoken languages
AVAILABLE_LANGUAGES = [
    ("English (en)", "en"),
    ("Auto-Detect (auto)", "auto"),
    ("Spanish (es)", "es"),
    ("French (fr)", "fr"),
    ("German (de)", "de"),
    ("Italian (it)", "it"),
    ("Portuguese (pt)", "pt"),
    ("Japanese (ja)", "ja"),
    ("Chinese (zh)", "zh"),
]

# OS Platform detection
IS_MAC = sys.platform == "darwin"

# Collision-free default hotkey:
# macOS: Cmd+Shift+Space (avoids Spotlight on Cmd+Space)
# Windows/Linux: Ctrl+Shift+Space (avoids Windows window menu on Alt+Space)
if IS_MAC:
    DEFAULT_HOTKEY = os.environ.get("YAPPER_HOTKEY", "<cmd>+<shift>+<space>")
    DEFAULT_HOTKEY_LABEL = os.environ.get("YAPPER_HOTKEY_LABEL", "Cmd+Shift+Space")
else:
    DEFAULT_HOTKEY = os.environ.get("YAPPER_HOTKEY", "<ctrl>+<shift>+<space>")
    DEFAULT_HOTKEY_LABEL = os.environ.get("YAPPER_HOTKEY_LABEL", "Ctrl+Shift+Space")


class YapperDesktopHUD:
    """Floating Desktop Voice Widget with expandable Settings Drawer & Model Picker."""

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Yapper Voice HUD")

        # Window styling: Borderless, always-on-top floating pill
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)

        # Load persisted preferences
        saved = self._load_settings()
        self.current_model = saved.get("model", "tiny.en")
        self.current_language = saved.get("language", "en")
        self.is_settings_open = False

        # Positioning: Start in top-right corner of primary monitor
        screen_w = self.root.winfo_screenwidth()
        self.pill_w, self.pill_h = 290, 52
        self.expanded_h = 240
        pos_x = screen_w - self.pill_w - 40
        pos_y = 60
        self.root.geometry(f"{self.pill_w}x{self.pill_h}+{pos_x}+{pos_y}")

        # Dragging state
        self._drag_start_x = 0
        self._drag_start_y = 0

        # State management
        self.is_model_ready = False
        self.is_recording = False
        self._pulse_state = False
        self.audio_frames = []
        self.audio_stream: Optional[sd.InputStream] = None
        self.kbd_controller = keyboard.Controller()

        # Build visual layout
        self._build_ui()
        self._bind_drag_events()

        # Keyboard escape cancels recording, closes settings drawer, or closes HUD
        self.root.bind("<Escape>", self._on_escape_pressed)

        # Start global keyboard listener in background thread
        self._start_global_hotkey_listener()

        # Kick off background model verification & pre-warming
        threading.Thread(target=self._prewarm_model_pipeline, daemon=True).start()

    def _load_settings(self) -> dict:
        try:
            if SETTINGS_FILE.exists():
                with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
        except Exception as e:
            logger.warning("Could not read HUD settings: %s", e)
        return {"model": "tiny.en", "language": "en"}

    def _save_settings(self) -> None:
        try:
            SETTINGS_DIR.mkdir(parents=True, exist_ok=True)
            with open(SETTINGS_FILE, "w", encoding="utf-8") as f:
                json.dump({
                    "model": self.current_model,
                    "language": self.current_language,
                }, f, indent=2)
        except Exception as e:
            logger.warning("Could not save HUD settings: %s", e)

    def _on_escape_pressed(self, event=None) -> None:
        if self.is_recording:
            self.cancel_recording()
        elif self.is_settings_open:
            self.close_settings()
        else:
            self.quit_app()

    def _build_ui(self) -> None:
        """Construct the tactile warm paper pill widget."""
        # Main outer container with subtle border
        self.container = tk.Frame(
            self.root,
            bg="#251C17",
            padx=2,
            pady=2,
            cursor="fleur",  # Move cursor
        )
        self.container.pack(fill="both", expand=True)

        # Inner paper card
        self.card = tk.Frame(
            self.container,
            bg="#FAF6EE",
            padx=12,
            pady=8,
        )
        self.card.pack(fill="both", expand=True)

        # Left: Interactive Red Wax Seal Voice Orb Button & Indicator
        self.orb_btn = tk.Canvas(
            self.card,
            width=26,
            height=26,
            bg="#FAF6EE",
            highlightthickness=0,
            cursor="hand2",
        )
        self.orb_btn.pack(side="left", padx=(0, 10))
        self.orb_circle = self.orb_btn.create_oval(
            3, 3, 23, 23,
            fill="#D9983B",
            outline="#B57A22",
            width=1.5,
        )
        # Inner stop square icon (visible only while recording)
        self.orb_stop_icon = self.orb_btn.create_rectangle(
            9, 9, 17, 17,
            fill="#FAF6EE",
            outline="",
            state="hidden",
        )
        self.orb_btn.bind("<Button-1>", lambda e: self.toggle_recording())

        def _on_orb_enter(e):
            if self.is_model_ready and not self.is_recording:
                self.orb_btn.itemconfig(self.orb_circle, fill="#E34A3B", outline="#C23B22")

        def _on_orb_leave(e):
            if self.is_model_ready and not self.is_recording:
                self.orb_btn.itemconfig(self.orb_circle, fill="#C23B22", outline="#8C2514")

        self.orb_btn.bind("<Enter>", _on_orb_enter)
        self.orb_btn.bind("<Leave>", _on_orb_leave)

        # Center: Status text
        self.text_frame = tk.Frame(self.card, bg="#FAF6EE")
        self.text_frame.pack(side="left", fill="both", expand=True)

        self.title_label = tk.Label(
            self.text_frame,
            text="Yapper",
            font=("Segoe UI", 10, "bold"),
            fg="#251C17",
            bg="#FAF6EE",
            anchor="w",
        )
        self.title_label.pack(anchor="w")

        self.status_label = tk.Label(
            self.text_frame,
            text="Loading AI model...",
            font=("Segoe UI", 8),
            fg="#736056",
            bg="#FAF6EE",
            anchor="w",
        )
        self.status_label.pack(anchor="w")

        # Right control buttons: Close (✕), Settings (⚙), Cancel (hidden until recording)
        self.close_btn = tk.Label(
            self.card,
            text="✕",
            font=("Segoe UI", 9),
            fg="#8C776E",
            bg="#FAF6EE",
            cursor="hand2",
            padx=3,
            pady=1,
        )
        self.close_btn.pack(side="right", padx=(2, 0))
        self.close_btn.bind("<Button-1>", lambda e: self.quit_app())

        def _on_close_enter(e):
            self.close_btn.config(fg="#C23B22")

        def _on_close_leave(e):
            self.close_btn.config(fg="#8C776E")

        self.close_btn.bind("<Enter>", _on_close_enter)
        self.close_btn.bind("<Leave>", _on_close_leave)

        # Settings button (gear icon ⚙)
        self.settings_btn = tk.Label(
            self.card,
            text="⚙",
            font=("Segoe UI", 11),
            fg="#8C776E",
            bg="#FAF6EE",
            cursor="hand2",
            padx=3,
            pady=1,
        )
        self.settings_btn.pack(side="right", padx=(2, 2))
        self.settings_btn.bind("<Button-1>", lambda e: self.toggle_settings())

        def _on_settings_enter(e):
            if not self.is_settings_open:
                self.settings_btn.config(fg="#251C17", bg="#EFE7DC")

        def _on_settings_leave(e):
            if not self.is_settings_open:
                self.settings_btn.config(fg="#8C776E", bg="#FAF6EE")

        self.settings_btn.bind("<Enter>", _on_settings_enter)
        self.settings_btn.bind("<Leave>", _on_settings_leave)

        # Cancel recording button (visible only while recording)
        self.cancel_btn = tk.Label(
            self.card,
            text="Cancel",
            font=("Segoe UI", 8),
            fg="#736056",
            bg="#FAF6EE",
            activebackground="#FCEBE9",
            activeforeground="#C23B22",
            cursor="hand2",
            padx=5,
            pady=1,
            relief="flat",
        )
        self.cancel_btn.bind("<Button-1>", lambda e: self.cancel_recording())

        def _on_cancel_enter(e):
            self.cancel_btn.config(fg="#C23B22", bg="#FCEBE9")

        def _on_cancel_leave(e):
            self.cancel_btn.config(fg="#736056", bg="#FAF6EE")

        self.cancel_btn.bind("<Enter>", _on_cancel_enter)
        self.cancel_btn.bind("<Leave>", _on_cancel_leave)

        # Settings Drawer Frame (inside self.container, beneath self.card)
        self.drawer_divider = tk.Frame(self.container, bg="#D7C3AF", height=1)

        self.settings_drawer = tk.Frame(
            self.container,
            bg="#FAF6EE",
            padx=12,
            pady=10,
        )

        # Drawer Header
        header_frame = tk.Frame(self.settings_drawer, bg="#FAF6EE")
        header_frame.pack(fill="x", pady=(0, 6))

        hdr_lbl = tk.Label(
            header_frame,
            text="SETTINGS & MODEL",
            font=("Segoe UI", 8, "bold"),
            fg="#8C776E",
            bg="#FAF6EE",
        )
        hdr_lbl.pack(side="left")

        self.drawer_badge = tk.Label(
            header_frame,
            text=f"Active: {self.current_model}",
            font=("Segoe UI", 8),
            fg="#736056",
            bg="#FAF6EE",
        )
        self.drawer_badge.pack(side="right")

        # Whisper Model Selector Row
        model_lbl = tk.Label(
            self.settings_drawer,
            text="Whisper Speech Model:",
            font=("Segoe UI", 8),
            fg="#594A42",
            bg="#FAF6EE",
            anchor="w",
        )
        model_lbl.pack(fill="x", pady=(2, 1))

        curr_model_label = AVAILABLE_MODELS[0][0]
        for lbl, key in AVAILABLE_MODELS:
            if key == self.current_model:
                curr_model_label = lbl
                break

        self.model_var = tk.StringVar(value=curr_model_label)
        self.model_menu = tk.OptionMenu(
            self.settings_drawer,
            self.model_var,
            *[lbl for lbl, _ in AVAILABLE_MODELS],
            command=self._on_model_menu_changed,
        )
        self.model_menu.config(
            bg="#FAF6EE",
            fg="#251C17",
            activebackground="#EFE7DC",
            activeforeground="#C23B22",
            relief="solid",
            bd=1,
            highlightthickness=0,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.model_menu["menu"].config(
            bg="#FAF6EE",
            fg="#251C17",
            activebackground="#C23B22",
            activeforeground="#FAF6EE",
            font=("Segoe UI", 8),
        )
        self.model_menu.pack(fill="x", pady=(0, 6))

        # Language Selector Row
        lang_lbl = tk.Label(
            self.settings_drawer,
            text="Spoken Language:",
            font=("Segoe UI", 8),
            fg="#594A42",
            bg="#FAF6EE",
            anchor="w",
        )
        lang_lbl.pack(fill="x", pady=(2, 1))

        curr_lang_label = AVAILABLE_LANGUAGES[0][0]
        for lbl, key in AVAILABLE_LANGUAGES:
            if key == self.current_language:
                curr_lang_label = lbl
                break

        self.lang_var = tk.StringVar(value=curr_lang_label)
        self.lang_menu = tk.OptionMenu(
            self.settings_drawer,
            self.lang_var,
            *[lbl for lbl, _ in AVAILABLE_LANGUAGES],
            command=self._on_lang_menu_changed,
        )
        self.lang_menu.config(
            bg="#FAF6EE",
            fg="#251C17",
            activebackground="#EFE7DC",
            activeforeground="#C23B22",
            relief="solid",
            bd=1,
            highlightthickness=0,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.lang_menu["menu"].config(
            bg="#FAF6EE",
            fg="#251C17",
            activebackground="#C23B22",
            activeforeground="#FAF6EE",
            font=("Segoe UI", 8),
        )
        self.lang_menu.pack(fill="x", pady=(0, 8))

        # Footer Row with Privacy note & Done button
        footer_frame = tk.Frame(self.settings_drawer, bg="#FAF6EE")
        footer_frame.pack(fill="x")

        note_lbl = tk.Label(
            footer_frame,
            text="100% On-Device · Zero Cloud",
            font=("Segoe UI", 7, "italic"),
            fg="#8C776E",
            bg="#FAF6EE",
        )
        note_lbl.pack(side="left")

        done_btn = tk.Label(
            footer_frame,
            text="Done",
            font=("Segoe UI", 8, "bold"),
            fg="#FAF6EE",
            bg="#251C17",
            cursor="hand2",
            padx=10,
            pady=2,
        )
        done_btn.pack(side="right")
        done_btn.bind("<Button-1>", lambda e: self.close_settings())

        def _on_done_enter(e):
            done_btn.config(bg="#C23B22")

        def _on_done_leave(e):
            done_btn.config(bg="#251C17")

        done_btn.bind("<Enter>", _on_done_enter)
        done_btn.bind("<Leave>", _on_done_leave)

    def open_settings(self) -> None:
        """Expand the floating HUD downwards to display the settings drawer."""
        if self.is_settings_open:
            return
        self.is_settings_open = True
        self.settings_btn.config(fg="#C23B22", bg="#EFE7DC")
        self.drawer_divider.pack(fill="x", side="top")
        self.settings_drawer.pack(fill="both", expand=True, side="top")
        cur_x, cur_y = self.root.winfo_x(), self.root.winfo_y()
        self.root.geometry(f"{self.pill_w}x{self.expanded_h}+{cur_x}+{cur_y}")

    def close_settings(self) -> None:
        """Collapse the settings drawer back into the sleek floating pill."""
        if not self.is_settings_open:
            return
        self.is_settings_open = False
        self.settings_btn.config(fg="#8C776E", bg="#FAF6EE")
        self.drawer_divider.pack_forget()
        self.settings_drawer.pack_forget()
        cur_x, cur_y = self.root.winfo_x(), self.root.winfo_y()
        self.root.geometry(f"{self.pill_w}x{self.pill_h}+{cur_x}+{cur_y}")

    def toggle_settings(self) -> None:
        """Toggle settings drawer open/close."""
        if self.is_settings_open:
            self.close_settings()
        else:
            self.open_settings()

    def _on_model_menu_changed(self, selected_label: str) -> None:
        """Triggered when user selects a different Whisper model in settings."""
        target_model = None
        for lbl, key in AVAILABLE_MODELS:
            if lbl == selected_label:
                target_model = key
                break
        if not target_model or target_model == self.current_model:
            return
        self._switch_model(target_model)

    def _on_lang_menu_changed(self, selected_label: str) -> None:
        """Triggered when user selects a different spoken language."""
        target_lang = "en"
        for lbl, key in AVAILABLE_LANGUAGES:
            if lbl == selected_label:
                target_lang = key
                break
        self.current_language = target_lang
        self._save_settings()
        logger.info("Spoken language changed to: %s", target_lang)

    def _switch_model(self, target_model: str) -> None:
        """Asynchronously download/load chosen model weights and pre-warm engine."""
        old_model = self.current_model
        self.current_model = target_model
        self._save_settings()

        self.is_model_ready = False
        self.orb_btn.itemconfig(self.orb_circle, fill="#D9983B", outline="#B57A22")
        self.status_label.config(text=f"Loading {target_model}...")
        self.drawer_badge.config(text=f"Loading {target_model}...", fg="#D9983B")

        def _worker():
            try:
                sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "yapper-engine")))
                from src.engine.model_loader import ensure_model_ready
                from src.engine.transcription import get_transcriber

                def _prog(pct, msg):
                    self.root.after(0, lambda: self.status_label.config(text=f"{msg}"))
                    self.root.after(0, lambda: self.drawer_badge.config(text=f"{msg}"))

                ensure_model_ready(target_model, progress_callback=_prog)
                transcriber = get_transcriber(model_size=target_model)
                if hasattr(transcriber, "_get_model"):
                    transcriber._get_model()

                def _on_ready():
                    self._set_model_ready()
                    self.drawer_badge.config(text=f"Active: {target_model}", fg="#2E7D32")
                    logger.info("Switched to model '%s' successfully.", target_model)

                self.root.after(0, _on_ready)
            except Exception as exc:
                logger.error("Failed to load model '%s': %s", target_model, exc)
                def _on_fail():
                    self.status_label.config(text=f"Error loading {target_model}")
                    self.drawer_badge.config(text=f"Error ({target_model})", fg="#C23B22")
                    self.current_model = old_model
                    self._set_model_ready()
                self.root.after(0, _on_fail)

        threading.Thread(target=_worker, daemon=True).start()

    def _bind_drag_events(self) -> None:
        """Allow dragging the floating pill anywhere on screen."""
        drag_widgets = [
            self.container,
            self.card,
            self.title_label,
            self.status_label,
            self.text_frame,
            self.settings_drawer,
        ]
        for widget in drag_widgets:
            widget.bind("<ButtonPress-1>", self._on_drag_start)
            widget.bind("<B1-Motion>", self._on_drag_motion)

    def _on_drag_start(self, event) -> None:
        self._drag_start_x = event.x_root - self.root.winfo_x()
        self._drag_start_y = event.y_root - self.root.winfo_y()

    def _on_drag_motion(self, event) -> None:
        x = event.x_root - self._drag_start_x
        y = event.y_root - self._drag_start_y
        self.root.geometry(f"+{x}+{y}")

    def _start_global_hotkey_listener(self) -> None:
        """Register system-wide global hotkey using pynput."""
        def for_canonical(f):
            return lambda k: f(listener.canonical(k))

        try:
            hotkey = keyboard.HotKey(
                keyboard.HotKey.parse(DEFAULT_HOTKEY),
                self._on_hotkey_triggered,
            )

            listener = keyboard.Listener(
                on_press=for_canonical(hotkey.press),
                on_release=for_canonical(hotkey.release),
            )
            listener.daemon = True
            listener.start()
            logger.info("Registered collision-free global hotkey: %s", DEFAULT_HOTKEY)
        except Exception as exc:
            logger.error("Failed to bind global hotkey '%s': %s", DEFAULT_HOTKEY, exc)

    def _prewarm_model_pipeline(self) -> None:
        """Pre-warm model weights on launch so speech transcription is instant."""
        try:
            # 1. Check if backend HTTP server is running
            import requests
            try:
                res = requests.get(f"{ENGINE_HTTP_URL}/health", timeout=1.5)
                if res.status_code == 200:
                    logger.info("Connected to Yapper Engine HTTP backend.")
                    self.root.after(0, self._set_model_ready)
                    return
            except Exception:
                pass

            # 2. Check and pre-warm local in-process model
            self.root.after(0, lambda: self.status_label.config(text=f"Verifying {self.current_model}..."))
            sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "yapper-engine")))
            from src.engine.transcription import get_transcriber
            from src.engine.model_loader import ensure_model_ready

            def _prog(pct, msg):
                self.root.after(0, lambda: self.status_label.config(text=f"{msg}"))

            ensure_model_ready(self.current_model, progress_callback=_prog)
            transcriber = get_transcriber(model_size=self.current_model)
            if hasattr(transcriber, "_get_model"):
                self.root.after(0, lambda: self.status_label.config(text=f"Loading {self.current_model}..."))
                transcriber._get_model()

            self.root.after(0, self._set_model_ready)
        except Exception as exc:
            logger.warning("Pre-warm completed with notice: %s", exc)
            self.root.after(0, self._set_model_ready)

    def _set_model_ready(self) -> None:
        """Transition widget to active, ready state."""
        self.is_model_ready = True
        self.orb_btn.itemconfig(self.orb_circle, fill="#C23B22", outline="#8C2514")
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.title_label.config(text="Yapper", fg="#251C17")
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to record")
        if hasattr(self, "drawer_badge"):
            self.drawer_badge.config(text=f"Active: {self.current_model}", fg="#2E7D32")

    def _on_hotkey_triggered(self) -> None:
        """Triggered when hotkey is pressed anywhere on Windows."""
        self.root.after(0, self.toggle_recording)

    def toggle_recording(self) -> None:
        if not self.is_model_ready:
            self.status_label.config(text="Model warming up, please wait...")
            return

        if not self.is_recording:
            self.start_recording()
        else:
            self.stop_recording()

    def start_recording(self) -> None:
        """Begin audio capture from primary microphone."""
        if self.is_recording:
            return
        if self.is_settings_open:
            self.close_settings()

        self.is_recording = True
        self.audio_frames = []

        # Update visual UI state: red circle with stop square, pulsing
        self.orb_btn.itemconfig(self.orb_circle, fill="#E34A3B", outline="#FF6B5B")
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="normal")
        self.title_label.config(text="Listening...", fg="#C23B22")
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to stop")
        self.cancel_btn.pack(side="right", padx=(2, 4))
        self._start_recording_pulse()

        try:
            self.audio_stream = sd.InputStream(
                samplerate=SAMPLE_RATE,
                channels=1,
                dtype="int16",
                callback=self._audio_callback,
                blocksize=1024,
            )
            self.audio_stream.start()
            logger.info("Microphone audio stream started.")
        except Exception as exc:
            logger.error("Failed to open audio input device: %s", exc)
            self.status_label.config(text="Mic Error!")
            self.is_recording = False
            self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")

    def _start_recording_pulse(self) -> None:
        self._pulse_state = False
        self._pulse_tick()

    def _pulse_tick(self) -> None:
        if not self.is_recording:
            return
        self._pulse_state = not self._pulse_state
        fill_col = "#E34A3B" if self._pulse_state else "#C23B22"
        outline_col = "#FF6B5B" if self._pulse_state else "#8C2514"
        self.orb_btn.itemconfig(self.orb_circle, fill=fill_col, outline=outline_col)
        self.root.after(450, self._pulse_tick)

    def _audio_callback(self, indata, frames, time_info, status) -> None:
        if self.is_recording:
            self.audio_frames.append(indata.copy())

    def cancel_recording(self) -> None:
        """Discard audio buffer and abort transcription immediately without typing."""
        if not self.is_recording:
            return
        logger.info("Recording cancelled by user. Discarding audio buffer.")
        self.is_recording = False
        self.cancel_btn.pack_forget()

        if self.audio_stream:
            try:
                self.audio_stream.stop()
                self.audio_stream.close()
            except Exception:
                pass
            self.audio_stream = None

        self.audio_frames = []

        # Visual feedback: flash 'Cancelled'
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill="#8C776E", outline="#5C4D44")
        self.title_label.config(text="Yapper", fg="#251C17")
        self.status_label.config(text="Cancelled")
        self.root.after(700, self._reset_ui_idle)

    def stop_recording(self) -> None:
        """Stop capture and dispatch to transcription backend."""
        if not self.is_recording:
            return
        self.is_recording = False
        self.cancel_btn.pack_forget()

        if self.audio_stream:
            self.audio_stream.stop()
            self.audio_stream.close()
            self.audio_stream = None

        # Update UI state to processing
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill="#D9983B", outline="#B57A22")
        self.title_label.config(text="Flow Inking...", fg="#D9983B")
        self.status_label.config(text="Transcribing & typing...")

        # Process in background thread so GUI doesn't freeze
        threading.Thread(target=self._process_and_paste_pipeline, daemon=True).start()

    def _process_and_paste_pipeline(self) -> None:
        """Convert recorded PCM to WAV, request transcription, and type into active window."""
        try:
            if not self.audio_frames:
                self.root.after(0, self._reset_ui_idle)
                return

            # Concatenate PCM frames
            audio_np = np.concatenate(self.audio_frames, axis=0)
            pcm_bytes = audio_np.tobytes()

            # Suppress tiny audio (< 0.25s)
            if len(pcm_bytes) < 8000:
                logger.info("Audio segment too short (<0.25s). Resetting.")
                self.root.after(0, self._reset_ui_idle)
                return

            wav_buf = io.BytesIO()
            with wave.open(wav_buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(SAMPLE_RATE)
                wf.writeframes(pcm_bytes)
            wav_bytes = wav_buf.getvalue()

            final_text = self._transcribe_audio(wav_bytes, pcm_bytes)
            self.root.after(0, self._on_transcription_finished, final_text)
        except Exception as exc:
            logger.error("Pipeline processing error: %s", exc, exc_info=True)
            self.root.after(0, self._reset_ui_idle)

    def _transcribe_audio(self, wav_bytes: bytes, pcm_bytes: bytes) -> str:
        """Transcribe via running yapper-engine HTTP API or direct faster-whisper."""
        # 1. First priority: Check running Yapper Engine server via HTTP (port 8000 or 8089)
        import requests
        for endpoint in [f"{ENGINE_HTTP_URL}/api/transcribe", "http://localhost:8089/api/transcribe"]:
            try:
                res = requests.post(
                    endpoint,
                    params={"language": self.current_language, "model": self.current_model},
                    files={"file": ("speech.wav", wav_bytes, "audio/wav")},
                    data={"language": self.current_language, "model": self.current_model},
                    timeout=8,
                )
                if res.status_code == 200:
                    text = res.json().get("text", "")
                    if text:
                        return text
            except Exception:
                pass

        # 2. Second priority: Direct in-process faster-whisper fallback
        try:
            sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "services", "yapper-engine")))
            from src.engine.transcription import get_transcriber
            from src.engine.formatter import FlowFormatter
            import asyncio

            async def run_direct():
                transcriber = get_transcriber(model_size=self.current_model)
                raw = await transcriber.transcribe(pcm_bytes, language=self.current_language)
                formatter = FlowFormatter()
                return await formatter.format_transcript(raw)

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            text = loop.run_until_complete(run_direct())
            loop.close()
            if text:
                return text
        except Exception as direct_err:
            logger.warning("Direct engine import fallback failed: %s", direct_err)

        return ""

    def _on_transcription_finished(self, final_text: str) -> None:
        """Executed strictly on the main GUI thread."""
        try:
            if final_text:
                logger.info("Transcribed text: %s", final_text)
                self.title_label.config(text="Pasting...", fg="#251C17")

                # Put text into clipboard safely on main thread
                self.root.clipboard_clear()
                self.root.clipboard_append(final_text + " ")

                # Fire paste simulation after small yield
                def _do_paste():
                    try:
                        paste_modifier = keyboard.Key.cmd if IS_MAC else keyboard.Key.ctrl
                        self.kbd_controller.press(paste_modifier)
                        self.kbd_controller.press('v')
                        self.kbd_controller.release('v')
                        self.kbd_controller.release(paste_modifier)
                        logger.info("Successfully inked text into active application cursor.")
                    except Exception as paste_err:
                        logger.error("Paste simulation error: %s", paste_err)
                    finally:
                        self._reset_ui_idle()

                self.root.after(60, _do_paste)
                return
            else:
                logger.info("No speech detected or empty transcription.")
        except Exception as exc:
            logger.error("Clipboard injection error: %s", exc)
        finally:
            if not final_text:
                self._reset_ui_idle()

    def _reset_ui_idle(self) -> None:
        """Reset widget visual indicators to idle ready state."""
        self.cancel_btn.pack_forget()
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill="#C23B22", outline="#8C2514")
        self.title_label.config(text="Yapper", fg="#251C17")
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to record")

    def quit_app(self) -> None:
        """Clean shutdown."""
        self.is_recording = False
        if self.audio_stream:
            self.audio_stream.stop()
            self.audio_stream.close()
        self.root.destroy()
        sys.exit(0)

    def run(self) -> None:
        self.root.mainloop()


if __name__ == "__main__":
    os_name = "macOS" if IS_MAC else "Windows"
    print("==================================================================")
    print(f" 🎙️ YAPPER DESKTOP VOICE HUD ({os_name} · Wispr Flow style)")
    print("==================================================================")
    print(" • Widget will float in top-right of your screen.")
    print(" • Click anywhere in VS Code, Notion, Slack, Word, or Chrome.")
    print(f" • Press {DEFAULT_HOTKEY_LABEL} anywhere on {os_name} to speak.")
    print(f" • Press {DEFAULT_HOTKEY_LABEL} again to stop and automatically type!")
    print(" • Click 'Cancel' or press Esc while recording to abort.")
    print(" • Drag the widget anywhere on your screen.")
    print("==================================================================")
    hud = YapperDesktopHUD()
    hud.run()
