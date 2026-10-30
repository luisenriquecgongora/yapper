"""Yapper Desktop Floating HUD Widget.

An always-on-top, draggable desktop voice pill that floats over any application
(VS Code, Notion, Slack, Word, Browser). Press the global hotkey (Ctrl+Shift+Space),
speak naturally, and Yapper will transcribe, clean, and type the text directly
wherever your cursor/mouse is focused.
"""

import sys
from pathlib import Path

# Ensure package directory is on pythonpath for direct script launches
current_dir = Path(__file__).resolve().parent
if str(current_dir) not in sys.path:
    sys.path.insert(0, str(current_dir))

try:
    from .hud import (
        AVAILABLE_LANGUAGES,
        AVAILABLE_MODELS,
        DEFAULT_HOTKEY,
        DEFAULT_HOTKEY_LABEL,
        IS_MAC,
        AudioRecorder,
        HotkeyListener,
        TextInjector,
        TranscriptionClient,
        YapperDesktopHUD,
        check_is_cached,
        get_model_compatibility,
        get_system_specs,
        run_hud,
    )
except (ImportError, ValueError):
    from hud import (
        AVAILABLE_LANGUAGES,
        AVAILABLE_MODELS,
        DEFAULT_HOTKEY,
        DEFAULT_HOTKEY_LABEL,
        IS_MAC,
        AudioRecorder,
        HotkeyListener,
        TextInjector,
        TranscriptionClient,
        YapperDesktopHUD,
        check_is_cached,
        get_model_compatibility,
        get_system_specs,
        run_hud,
    )

__all__ = [
    "AVAILABLE_LANGUAGES",
    "AVAILABLE_MODELS",
    "DEFAULT_HOTKEY",
    "DEFAULT_HOTKEY_LABEL",
    "IS_MAC",
    "AudioRecorder",
    "HotkeyListener",
    "TextInjector",
    "TranscriptionClient",
    "YapperDesktopHUD",
    "check_is_cached",
    "get_model_compatibility",
    "get_system_specs",
    "run_hud",
]

if __name__ == "__main__":
    run_hud()
