"""Yapper Desktop Floating HUD Widget (Wispr Flow style).

An always-on-top, draggable desktop voice pill that floats over any application
(VS Code, Notion, Slack, Word, Browser). Press the global hotkey (Alt+Space),
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
from typing import Optional

# Audio recording via sounddevice
import sounddevice as sd
import numpy as np

# Global hotkey and keyboard simulation via pynput
from pynput import keyboard

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] [HUD]: %(message)s")
logger = logging.getLogger("yapper.hud")

# Engine connection defaults
ENGINE_HTTP_URL = os.environ.get("YAPPER_ENGINE_URL", "http://localhost:8000")
SAMPLE_RATE = 16000


class YapperDesktopHUD:
    """Floating Desktop Voice Widget."""

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Yapper Voice HUD")

        # Window styling: Borderless, always-on-top floating pill
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)

        # Positioning: Start in top-right corner of primary monitor
        screen_w = self.root.winfo_screenwidth()
        pill_w, pill_h = 280, 52
        pos_x = screen_w - pill_w - 40
        pos_y = 60
        self.root.geometry(f"{pill_w}x{pill_h}+{pos_x}+{pos_y}")

        # Dragging state
        self._drag_start_x = 0
        self._drag_start_y = 0

        # Recording state
        self.is_recording = False
        self.audio_frames = []
        self.audio_stream: Optional[sd.InputStream] = None
        self.kbd_controller = keyboard.Controller()

        # Build visual layout
        self._build_ui()
        self._bind_drag_events()

        # Start global keyboard listener in background thread
        self._start_global_hotkey_listener()

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

        # Left: Wax seal orb dot indicator
        self.orb_indicator = tk.Canvas(
            self.card,
            width=18,
            height=18,
            bg="#FAF6EE",
            highlightthickness=0,
        )
        self.orb_indicator.pack(side="left", padx=(0, 8))
        self.orb_circle = self.orb_indicator.create_oval(2, 2, 16, 16, fill="#C23B22", outline="#8C2514", width=1)

        # Center: Status text
        self.text_frame = tk.Frame(self.card, bg="#FAF6EE")
        self.text_frame.pack(side="left", fill="both", expand=True)

        self.title_label = tk.Label(
            self.text_frame,
            text="Yapper Flow",
            font=("Segoe UI", 10, "bold"),
            fg="#251C17",
            bg="#FAF6EE",
            anchor="w",
        )
        self.title_label.pack(anchor="w")

        self.status_label = tk.Label(
            self.text_frame,
            text="Press Alt+Space to Speak",
            font=("Segoe UI", 8),
            fg="#736056",
            bg="#FAF6EE",
            anchor="w",
        )
        self.status_label.pack(anchor="w")

        # Right: Hotkey badge button
        self.hotkey_btn = tk.Label(
            self.card,
            text="Alt+Space",
            font=("Consolas", 8, "bold"),
            fg="#FAF6EE",
            bg="#3A2D25",
            padx=6,
            pady=2,
            relief="flat",
            cursor="hand2",
        )
        self.hotkey_btn.pack(side="right", padx=(4, 0))
        self.hotkey_btn.bind("<Button-1>", lambda e: self.toggle_recording())

        # Close button
        self.close_btn = tk.Label(
            self.card,
            text="✕",
            font=("Segoe UI", 8),
            fg="#8C776E",
            bg="#FAF6EE",
            cursor="hand2",
        )
        self.close_btn.pack(side="right", padx=(0, 4))
        self.close_btn.bind("<Button-1>", lambda e: self.quit_app())

    def _bind_drag_events(self) -> None:
        """Allow dragging the floating pill anywhere on screen."""
        for widget in (self.container, self.card, self.title_label, self.status_label, self.text_frame):
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
        """Register system-wide global hotkey (Alt+Space) using pynput."""
        def for_canonical(f):
            return lambda k: f(listener.canonical(k))

        # Register Alt+Space combination
        hotkey = keyboard.HotKey(
            keyboard.HotKey.parse("<alt>+<space>"),
            self._on_hotkey_triggered,
        )

        listener = keyboard.Listener(
            on_press=for_canonical(hotkey.press),
            on_release=for_canonical(hotkey.release),
        )
        listener.daemon = True
        listener.start()

    def _on_hotkey_triggered(self) -> None:
        """Triggered when Alt+Space is pressed anywhere on Windows."""
        self.root.after(0, self.toggle_recording)

    def toggle_recording(self) -> None:
        if not self.is_recording:
            self.start_recording()
        else:
            self.stop_recording()

    def start_recording(self) -> None:
        """Begin audio capture from primary microphone."""
        if self.is_recording:
            return
        self.is_recording = True
        self.audio_frames = []

        # Update visual UI state
        self.orb_indicator.itemconfig(self.orb_circle, fill="#E34A3B", outline="#FF6B5B")
        self.title_label.config(text="Listening...", fg="#C23B22")
        self.status_label.config(text="Speak aloud now • Alt+Space to commit")
        self.hotkey_btn.config(bg="#C23B22")

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

    def _audio_callback(self, indata, frames, time_info, status) -> None:
        if self.is_recording:
            self.audio_frames.append(indata.copy())

    def stop_recording(self) -> None:
        """Stop capture and dispatch to transcription backend."""
        if not self.is_recording:
            return
        self.is_recording = False

        if self.audio_stream:
            self.audio_stream.stop()
            self.audio_stream.close()
            self.audio_stream = None

        # Update UI state to processing
        self.orb_indicator.itemconfig(self.orb_circle, fill="#D9983B", outline="#F2B75B")
        self.title_label.config(text="Flow Inking...", fg="#D9983B")
        self.status_label.config(text="Transcribing & cleaning...")
        self.hotkey_btn.config(bg="#3A2D25")

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
                    files={"file": ("speech.wav", wav_bytes, "audio/wav")},
                    data={"language": "en"},
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
                transcriber = get_transcriber()
                raw = await transcriber.transcribe(pcm_bytes, language="en")
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
                        self.kbd_controller.press(keyboard.Key.ctrl)
                        self.kbd_controller.press('v')
                        self.kbd_controller.release('v')
                        self.kbd_controller.release(keyboard.Key.ctrl)
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
        self.orb_indicator.itemconfig(self.orb_circle, fill="#C23B22", outline="#8C2514")
        self.title_label.config(text="Yapper Flow", fg="#251C17")
        self.status_label.config(text="Press Alt+Space to Speak")
        self.hotkey_btn.config(bg="#3A2D25")

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
    print("==================================================================")
    print(" 🎙️ YAPPER DESKTOP VOICE HUD (Wispr Flow style)")
    print("==================================================================")
    print(" • Widget will float in top-right of your screen.")
    print(" • Click anywhere in VS Code, Notion, Slack, Word, or Chrome.")
    print(" • Press Alt+Space anywhere on Windows to speak.")
    print(" • Press Alt+Space again to stop and automatically type the text!")
    print(" • Drag the widget anywhere on your screen.")
    print("==================================================================")
    hud = YapperDesktopHUD()
    hud.run()
