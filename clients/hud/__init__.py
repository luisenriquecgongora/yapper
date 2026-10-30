"""Yapper Desktop HUD package.

Modular, SOLID-compliant desktop voice widget architecture.
"""

from .audio import AudioRecorder
from .config import AVAILABLE_LANGUAGES, DEFAULT_HOTKEY, DEFAULT_HOTKEY_LABEL, IS_MAC
from .hardware import get_system_specs
from .input import HotkeyListener, TextInjector
from .models import AVAILABLE_MODELS, check_is_cached, get_model_compatibility
from .transcriber import TranscriptionClient
from .ui import YapperDesktopHUD, run_hud

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
