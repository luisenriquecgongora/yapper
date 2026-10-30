"""Configuration constants, color palettes, and environment paths for Yapper Desktop HUD."""

import os
import sys
from pathlib import Path

# Audio capture specifications
SAMPLE_RATE = 16000
AUDIO_CHANNELS = 1
AUDIO_DTYPE = "int16"
AUDIO_BLOCKSIZE = 1024
MIN_PCM_BYTES = 8000  # Minimum ~0.25s of audio to process

# Engine HTTP endpoint
ENGINE_HTTP_URL = os.environ.get("YAPPER_ENGINE_URL", "http://localhost:8000")
FALLBACK_HTTP_URL = "http://localhost:8089"

# User persistent settings path
SETTINGS_DIR = Path.home() / ".cache" / "yapper"
SETTINGS_FILE = SETTINGS_DIR / "hud_settings.json"

# Operating system platform detection
IS_MAC = sys.platform == "darwin"
IS_WINDOWS = sys.platform == "win32"

# Global hotkey defaults:
# macOS: Cmd+Shift+Space (avoids Spotlight on Cmd+Space)
# Windows/Linux: Ctrl+Shift+Space (avoids window menu on Alt+Space)
if IS_MAC:
    DEFAULT_HOTKEY = os.environ.get("YAPPER_HOTKEY", "<cmd>+<shift>+<space>")
    DEFAULT_HOTKEY_LABEL = os.environ.get("YAPPER_HOTKEY_LABEL", "Cmd+Shift+Space")
else:
    DEFAULT_HOTKEY = os.environ.get("YAPPER_HOTKEY", "<ctrl>+<shift>+<space>")
    DEFAULT_HOTKEY_LABEL = os.environ.get("YAPPER_HOTKEY_LABEL", "Ctrl+Shift+Space")

# Supported spoken languages catalog
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

# Color Palette: Warm paper tactile aesthetic
THEME = {
    "bg_container": "#251C17",
    "bg_card": "#FAF6EE",
    "bg_card_hover": "#EFE7DC",
    "bg_card_active": "#EDE3D5",
    "bg_card_downloading": "#FFFBF0",
    "bg_card_uninstalled": "#F3EDE2",
    "bg_banner": "#F4EFE6",
    "border_subtle": "#D7C3AF",
    "text_primary": "#251C17",
    "text_secondary": "#594A42",
    "text_muted": "#736056",
    "text_subtle": "#8C776E",
    "accent_red": "#C23B22",
    "accent_red_hover": "#E34A3B",
    "accent_red_pulse": "#FF6B5B",
    "accent_red_border": "#8C2514",
    "accent_amber": "#D9983B",
    "accent_amber_border": "#B57A22",
    "accent_green": "#2E7D32",
    "btn_uninstalled_bg": "#E5D9CB",
    "btn_uninstalled_hover": "#D4C5B3",
    "btn_cancel_hover_bg": "#FCEBE9",
}

# Floating HUD window dimensions
PILL_WIDTH = 350
PILL_HEIGHT = 52
EXPANDED_HEIGHT = 445
