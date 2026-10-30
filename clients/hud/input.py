"""Operating system input integration: Global hotkey listening and simulated typing."""

import logging
from typing import Callable, Optional
from pynput import keyboard

from .config import DEFAULT_HOTKEY, IS_MAC

logger = logging.getLogger("yapper.hud.input")


class HotkeyListener:
    """Manages system-wide global hotkey listener using pynput."""

    def __init__(self, hotkey_str: str = DEFAULT_HOTKEY, on_triggered: Optional[Callable[[], None]] = None) -> None:
        self.hotkey_str = hotkey_str
        self.on_triggered = on_triggered
        self._listener: Optional[keyboard.Listener] = None

    def start(self) -> None:
        """Register system-wide global hotkey daemon thread."""
        def for_canonical(f):
            return lambda k: f(self._listener.canonical(k) if self._listener else k)

        try:
            hotkey = keyboard.HotKey(
                keyboard.HotKey.parse(self.hotkey_str),
                self._handle_triggered,
            )
            self._listener = keyboard.Listener(
                on_press=for_canonical(hotkey.press),
                on_release=for_canonical(hotkey.release),
            )
            self._listener.daemon = True
            self._listener.start()
            logger.info("Registered system global hotkey: %s", self.hotkey_str)
        except Exception as exc:
            logger.error("Failed to bind global hotkey '%s': %s", self.hotkey_str, exc)

    def _handle_triggered(self) -> None:
        if self.on_triggered:
            self.on_triggered()

    def stop(self) -> None:
        """Stop hotkey listening daemon."""
        if self._listener:
            try:
                self._listener.stop()
            except Exception:
                pass
            self._listener = None


class TextInjector:
    """Safely injects text into the active OS focus target using simulated clipboard paste."""

    def __init__(self) -> None:
        self._controller = keyboard.Controller()

    def inject_text(self, text: str, root_window=None, on_complete: Optional[Callable[[], None]] = None) -> None:
        """Copies text to clipboard and simulates paste keystroke (Ctrl+V / Cmd+V)."""
        if not text:
            if on_complete:
                on_complete()
            return

        clean_text = text.strip() + " "

        def _do_paste():
            try:
                modifier = keyboard.Key.cmd if IS_MAC else keyboard.Key.ctrl
                self._controller.press(modifier)
                self._controller.press('v')
                self._controller.release('v')
                self._controller.release(modifier)
                logger.info("Pasted transcribed text into active cursor.")
            except Exception as exc:
                logger.error("Failed to inject text via simulated paste: %s", exc)
            finally:
                if on_complete:
                    on_complete()

        if root_window is not None:
            # Safely set clipboard on Tkinter GUI thread
            try:
                root_window.clipboard_clear()
                root_window.clipboard_append(clean_text)
                root_window.update()  # ensure clipboard is populated
            except Exception as cb_err:
                logger.warning("Tkinter clipboard update warning: %s", cb_err)

            root_window.after(60, _do_paste)
        else:
            _do_paste()
