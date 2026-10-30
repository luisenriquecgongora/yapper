"""Tkinter Floating HUD UI component: Always-on-top pill widget and settings drawer."""

import json
import logging
import os
import queue
import sys
import threading
import tkinter as tk
from typing import Any, Callable, Dict, Optional

from .audio import AudioRecorder
from .config import (
    AVAILABLE_LANGUAGES,
    DEFAULT_HOTKEY,
    DEFAULT_HOTKEY_LABEL,
    EXPANDED_HEIGHT,
    PILL_HEIGHT,
    PILL_WIDTH,
    SETTINGS_DIR,
    SETTINGS_FILE,
    THEME,
)
from .hardware import get_system_specs
from .input import HotkeyListener, TextInjector
from .models import AVAILABLE_MODELS, check_is_cached, get_model_compatibility
from .transcriber import TranscriptionClient

logger = logging.getLogger("yapper.hud.ui")


def bind_hover(widget: tk.Widget, normal_bg: str, hover_bg: str, normal_fg: Optional[str] = None, hover_fg: Optional[str] = None) -> None:
    """Helper to bind DRY hover styling across UI elements."""
    def _enter(e):
        cfg = {"bg": hover_bg}
        if hover_fg:
            cfg["fg"] = hover_fg
        try:
            widget.config(**cfg)
        except Exception:
            pass

    def _leave(e):
        cfg = {"bg": normal_bg}
        if normal_fg:
            cfg["fg"] = normal_fg
        try:
            widget.config(**cfg)
        except Exception:
            pass

    widget.bind("<Enter>", _enter)
    widget.bind("<Leave>", _leave)


class YapperDesktopHUD:
    """Floating Desktop Voice Widget with expandable Settings Drawer & Model Picker."""

    def __init__(self) -> None:
        self.root = tk.Tk()
        self.root.title("Yapper Voice HUD")

        # Window styling: Borderless, always-on-top floating pill
        self.root.overrideredirect(True)
        self.root.attributes("-topmost", True)

        # Core subsystems
        self.recorder = AudioRecorder()
        self.injector = TextInjector()
        self.transcriber = TranscriptionClient()
        self.system_specs = get_system_specs()

        # Load persisted preferences
        saved = self._load_settings()
        self.current_model = saved.get("model", "tiny.en")
        self.current_language = saved.get("language", "en")
        self.is_settings_open = False
        self.is_model_ready = False
        self._pulse_state = False
        self.downloading_models: Dict[str, str] = {}
        self.card_widgets: Dict[str, Dict[str, Any]] = {}

        # Screen positioning: Start in top-right corner of primary monitor
        screen_w = self.root.winfo_screenwidth()
        pos_x = screen_w - PILL_WIDTH - 30
        pos_y = 50
        self.root.geometry(f"{PILL_WIDTH}x{PILL_HEIGHT}+{pos_x}+{pos_y}")

        # Dragging coordinates state
        self._drag_start_x = 0
        self._drag_start_y = 0

        # Thread-safe GUI queue
        self._gui_queue: queue.Queue = queue.Queue()
        self._poll_gui_queue()

        # Visual layout construction
        self._build_ui()
        self._bind_drag_events()

        # Bind keyboard shortcuts on the widget
        self.root.bind("<Escape>", self._on_escape_pressed)

        # Global hotkey listener
        self.hotkey_listener = HotkeyListener(
            hotkey_str=DEFAULT_HOTKEY,
            on_triggered=lambda: self.root.after(0, self.toggle_recording),
        )
        self.hotkey_listener.start()

        # Asynchronous model verification & pre-warming
        threading.Thread(target=self._prewarm_model_pipeline, daemon=True).start()

    # -------------------------------------------------------------------------
    # Thread-Safe UI Queue Dispatcher
    # -------------------------------------------------------------------------
    def _run_on_ui(self, callback: Callable[[], None]) -> None:
        """Thread-safe dispatch to the Tkinter GUI main thread via queue."""
        self._gui_queue.put(callback)

    def _poll_gui_queue(self) -> None:
        """Drain GUI callbacks on the main thread every 30ms."""
        while not self._gui_queue.empty():
            try:
                fn = self._gui_queue.get_nowait()
                fn()
            except Exception as e:
                logger.error("GUI queue execution error: %s", e)
        if self.root and self.root.winfo_exists():
            try:
                self.root.after(30, self._poll_gui_queue)
            except Exception:
                pass

    # -------------------------------------------------------------------------
    # Settings Persistence
    # -------------------------------------------------------------------------
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

    # -------------------------------------------------------------------------
    # UI Layout Construction
    # -------------------------------------------------------------------------
    def _build_ui(self) -> None:
        """Construct the tactile warm paper pill widget."""
        # Main outer container with subtle border
        self.container = tk.Frame(
            self.root,
            bg=THEME["bg_container"],
            padx=2,
            pady=2,
            cursor="fleur",
        )
        self.container.pack(fill="both", expand=True)

        # Inner paper card
        self.card = tk.Frame(
            self.container,
            bg=THEME["bg_card"],
            padx=12,
            pady=8,
        )
        self.card.pack(fill="both", expand=True)

        # Left: Interactive Red Wax Seal Voice Orb Button & Indicator
        self.orb_btn = tk.Canvas(
            self.card,
            width=26,
            height=26,
            bg=THEME["bg_card"],
            highlightthickness=0,
            cursor="hand2",
        )
        self.orb_btn.pack(side="left", padx=(0, 10))
        self.orb_circle = self.orb_btn.create_oval(
            3, 3, 23, 23,
            fill=THEME["accent_amber"],
            outline=THEME["accent_amber_border"],
            width=1.5,
        )
        # Inner stop square icon (visible only while recording)
        self.orb_stop_icon = self.orb_btn.create_rectangle(
            9, 9, 17, 17,
            fill=THEME["bg_card"],
            outline="",
            state="hidden",
        )
        self.orb_btn.bind("<Button-1>", lambda e: self.toggle_recording())

        def _on_orb_enter(e):
            if self.is_model_ready and not self.recorder.is_recording:
                self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_red_hover"], outline=THEME["accent_red"])

        def _on_orb_leave(e):
            if self.is_model_ready and not self.recorder.is_recording:
                self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_red"], outline=THEME["accent_red_border"])

        self.orb_btn.bind("<Enter>", _on_orb_enter)
        self.orb_btn.bind("<Leave>", _on_orb_leave)

        # Center: Status text
        self.text_frame = tk.Frame(self.card, bg=THEME["bg_card"])
        self.text_frame.pack(side="left", fill="both", expand=True)

        self.title_label = tk.Label(
            self.text_frame,
            text="Yapper",
            font=("Segoe UI", 10, "bold"),
            fg=THEME["text_primary"],
            bg=THEME["bg_card"],
            anchor="w",
        )
        self.title_label.pack(anchor="w")

        self.status_label = tk.Label(
            self.text_frame,
            text="Loading AI model...",
            font=("Segoe UI", 8),
            fg=THEME["text_muted"],
            bg=THEME["bg_card"],
            anchor="w",
        )
        self.status_label.pack(anchor="w")

        # Right control buttons: Close (✕), Settings (⚙), Cancel (hidden until recording)
        self.close_btn = tk.Label(
            self.card,
            text="✕",
            font=("Segoe UI", 9),
            fg=THEME["text_subtle"],
            bg=THEME["bg_card"],
            cursor="hand2",
            padx=3,
            pady=1,
        )
        self.close_btn.pack(side="right", padx=(2, 0))
        self.close_btn.bind("<Button-1>", lambda e: self.quit_app())
        bind_hover(self.close_btn, THEME["bg_card"], THEME["bg_card"], THEME["text_subtle"], THEME["accent_red"])

        # Settings button (gear icon ⚙)
        self.settings_btn = tk.Label(
            self.card,
            text="⚙",
            font=("Segoe UI", 11),
            fg=THEME["text_subtle"],
            bg=THEME["bg_card"],
            cursor="hand2",
            padx=3,
            pady=1,
        )
        self.settings_btn.pack(side="right", padx=(2, 2))
        self.settings_btn.bind("<Button-1>", lambda e: self.toggle_settings())

        def _on_settings_enter(e):
            if not self.is_settings_open:
                self.settings_btn.config(fg=THEME["text_primary"], bg=THEME["bg_card_hover"])

        def _on_settings_leave(e):
            if not self.is_settings_open:
                self.settings_btn.config(fg=THEME["text_subtle"], bg=THEME["bg_card"])

        self.settings_btn.bind("<Enter>", _on_settings_enter)
        self.settings_btn.bind("<Leave>", _on_settings_leave)

        # Cancel recording button (visible only while recording)
        self.cancel_btn = tk.Label(
            self.card,
            text="Cancel",
            font=("Segoe UI", 8),
            fg=THEME["text_muted"],
            bg=THEME["bg_card"],
            activebackground=THEME["btn_cancel_hover_bg"],
            activeforeground=THEME["accent_red"],
            cursor="hand2",
            padx=5,
            pady=1,
            relief="flat",
        )
        self.cancel_btn.bind("<Button-1>", lambda e: self.cancel_recording())
        bind_hover(self.cancel_btn, THEME["bg_card"], THEME["btn_cancel_hover_bg"], THEME["text_muted"], THEME["accent_red"])

        # Settings Drawer Frame (inside container, below pill)
        self.drawer_divider = tk.Frame(self.container, bg=THEME["border_subtle"], height=1)

        self.settings_drawer = tk.Frame(
            self.container,
            bg=THEME["bg_card"],
            padx=10,
            pady=8,
        )

        self._build_settings_drawer_content()

    def _build_settings_drawer_content(self) -> None:
        """Construct drawer interior: header, hardware banner, models list, language selector, footer."""
        # 1. Header Row
        header_frame = tk.Frame(self.settings_drawer, bg=THEME["bg_card"])
        header_frame.pack(fill="x", pady=(0, 4))

        hdr_lbl = tk.Label(
            header_frame,
            text="SETTINGS & MODELS",
            font=("Segoe UI", 8, "bold"),
            fg=THEME["text_subtle"],
            bg=THEME["bg_card"],
        )
        hdr_lbl.pack(side="left")

        collapse_btn = tk.Label(
            header_frame,
            text="▲ Hide",
            font=("Segoe UI", 8),
            fg=THEME["text_muted"],
            bg=THEME["bg_card"],
            cursor="hand2",
            padx=4,
        )
        collapse_btn.pack(side="right")
        collapse_btn.bind("<Button-1>", lambda e: self.close_settings())
        bind_hover(collapse_btn, THEME["bg_card"], THEME["bg_card"], THEME["text_muted"], THEME["accent_red"])

        # 2. System Hardware Specs Banner
        hw_frame = tk.Frame(self.settings_drawer, bg=THEME["bg_banner"], bd=1, relief="solid", padx=8, pady=4)
        hw_frame.pack(fill="x", pady=(0, 6))

        ram_val = self.system_specs.get("ram_gb", 8.0)
        vram_val = self.system_specs.get("vram_gb")
        gpu_name = self.system_specs.get("gpu_name")
        is_unified = self.system_specs.get("is_unified", False)
        os_val = self.system_specs.get("os_name", "PC")

        if is_unified:
            vram_title = f"🎮 Unified VRAM: {ram_val:.1f} GB (Apple Silicon High-Bandwidth)"
            vram_color = THEME["accent_green"]
        elif vram_val and gpu_name:
            gpu_short = gpu_name.replace("GeForce ", "").replace("Graphics", "").strip()
            vram_title = f"🎮 Dedicated VRAM: {vram_val:.1f} GB ({gpu_short})"
            vram_color = THEME["accent_green"] if vram_val >= 3.0 else THEME["accent_amber_border"]
        elif vram_val:
            vram_title = f"🎮 Dedicated VRAM: {vram_val:.1f} GB"
            vram_color = THEME["accent_green"] if vram_val >= 3.0 else THEME["accent_amber_border"]
        else:
            vram_title = "🎮 GPU VRAM: Integrated / Shared (CPU Mode)"
            vram_color = THEME["text_muted"]

        tk.Label(
            hw_frame,
            text=vram_title,
            font=("Segoe UI", 8, "bold"),
            fg=vram_color,
            bg=THEME["bg_banner"],
            anchor="w",
        ).pack(fill="x")

        tk.Label(
            hw_frame,
            text=f"💻 System RAM: {ram_val:.1f} GB ({os_val}) · Local AI Ready",
            font=("Segoe UI", 7, "bold"),
            fg="#3D3028",
            bg=THEME["bg_banner"],
            anchor="w",
        ).pack(fill="x")

        tk.Label(
            hw_frame,
            text="⚡ Compatibility & GPU acceleration calculated for each model:",
            font=("Segoe UI", 7),
            fg=THEME["text_muted"],
            bg=THEME["bg_banner"],
            anchor="w",
        ).pack(fill="x")

        # 3. Scrollable Models List
        list_outer = tk.Frame(self.settings_drawer, bg=THEME["bg_card"])
        list_outer.pack(fill="both", expand=True, pady=(0, 6))

        self.models_canvas = tk.Canvas(list_outer, bg=THEME["bg_card"], highlightthickness=0, height=205)
        self.models_scrollbar = tk.Scrollbar(list_outer, orient="vertical", command=self.models_canvas.yview)
        self.models_content = tk.Frame(self.models_canvas, bg=THEME["bg_card"])

        self.models_content.bind(
            "<Configure>",
            lambda e: self.models_canvas.configure(scrollregion=self.models_canvas.bbox("all")),
        )
        self.models_canvas.create_window((0, 0), window=self.models_content, anchor="nw", width=312)
        self.models_canvas.configure(yscrollcommand=self.models_scrollbar.set)

        self.models_canvas.pack(side="left", fill="both", expand=True)
        self.models_scrollbar.pack(side="right", fill="y")

        def _on_mousewheel(event):
            delta = -1 * int(event.delta / 120) if event.delta else (1 if event.num == 5 else -1)
            self.models_canvas.yview_scroll(delta, "units")

        self.models_canvas.bind("<MouseWheel>", _on_mousewheel)
        self.models_content.bind("<MouseWheel>", _on_mousewheel)

        self._build_model_cards(_on_mousewheel)

        # 4. Spoken Language Selector Row
        lang_frame = tk.Frame(self.settings_drawer, bg=THEME["bg_card"])
        lang_frame.pack(fill="x", pady=(0, 6))

        tk.Label(
            lang_frame,
            text="Spoken Language:",
            font=("Segoe UI", 8),
            fg=THEME["text_secondary"],
            bg=THEME["bg_card"],
        ).pack(side="left", padx=(0, 6))

        curr_lang_label = AVAILABLE_LANGUAGES[0][0]
        for lbl, key in AVAILABLE_LANGUAGES:
            if key == self.current_language:
                curr_lang_label = lbl
                break

        self.lang_var = tk.StringVar(value=curr_lang_label)
        self.lang_menu = tk.OptionMenu(
            lang_frame,
            self.lang_var,
            *[lbl for lbl, _ in AVAILABLE_LANGUAGES],
            command=self._on_lang_menu_changed,
        )
        self.lang_menu.config(
            bg=THEME["bg_card"],
            fg=THEME["text_primary"],
            activebackground=THEME["bg_card_hover"],
            activeforeground=THEME["accent_red"],
            relief="solid",
            bd=1,
            highlightthickness=0,
            font=("Segoe UI", 8),
            anchor="w",
        )
        self.lang_menu["menu"].config(
            bg=THEME["bg_card"],
            fg=THEME["text_primary"],
            activebackground=THEME["accent_red"],
            activeforeground=THEME["bg_card"],
            font=("Segoe UI", 8),
        )
        self.lang_menu.pack(side="right", fill="x", expand=True)

        # 5. Footer Row with Privacy note & Done button
        footer_frame = tk.Frame(self.settings_drawer, bg=THEME["bg_card"])
        footer_frame.pack(fill="x")

        tk.Label(
            footer_frame,
            text="🔒 100% On-Device · Zero Cloud",
            font=("Segoe UI", 7, "italic"),
            fg=THEME["text_subtle"],
            bg=THEME["bg_card"],
        ).pack(side="left")

        done_btn = tk.Label(
            footer_frame,
            text="Done",
            font=("Segoe UI", 8, "bold"),
            fg=THEME["bg_card"],
            bg=THEME["text_primary"],
            cursor="hand2",
            padx=10,
            pady=2,
        )
        done_btn.pack(side="right")
        done_btn.bind("<Button-1>", lambda e: self.close_settings())
        bind_hover(done_btn, THEME["text_primary"], THEME["accent_red"])

    def _build_model_cards(self, mousewheel_handler: Callable) -> None:
        """Construct individual card elements for each available Whisper model."""
        ram_gb = self.system_specs.get("ram_gb", 8.0)
        vram_gb = self.system_specs.get("vram_gb")
        is_unified = self.system_specs.get("is_unified", False)

        for m in AVAILABLE_MODELS:
            mid = m["id"]
            _compat_status, compat_text, compat_color = get_model_compatibility(
                m, ram_gb=ram_gb, vram_gb=vram_gb, is_unified=is_unified
            )

            card = tk.Frame(self.models_content, bg=THEME["bg_card"], bd=1, relief="solid", padx=8, pady=4)
            card.pack(fill="x", pady=2)

            top_row = tk.Frame(card, bg=THEME["bg_card"])
            top_row.pack(fill="x")

            name_lbl = tk.Label(
                top_row,
                text=f"{m['name']}  ·  {m['size_str']}",
                font=("Segoe UI", 8, "bold"),
                fg=THEME["text_primary"],
                bg=THEME["bg_card"],
                anchor="w",
            )
            name_lbl.pack(side="left")

            action_btn = tk.Label(top_row, text="State", font=("Segoe UI", 7, "bold"), padx=6, pady=1)
            action_btn.pack(side="right")

            bottom_row = tk.Frame(card, bg=THEME["bg_card"])
            bottom_row.pack(fill="x", pady=(2, 0))

            compat_lbl = tk.Label(
                bottom_row,
                text=compat_text,
                font=("Segoe UI", 7, "bold"),
                fg=compat_color,
                bg=THEME["bg_card"],
                anchor="w",
            )
            compat_lbl.pack(side="left")

            desc_lbl = tk.Label(
                bottom_row,
                text=m["desc"],
                font=("Segoe UI", 7),
                fg=THEME["text_muted"],
                bg=THEME["bg_card"],
                anchor="e",
            )
            desc_lbl.pack(side="right")

            self.card_widgets[mid] = {
                "card": card,
                "top": top_row,
                "bottom": bottom_row,
                "name_lbl": name_lbl,
                "action_btn": action_btn,
                "compat_lbl": compat_lbl,
                "desc_lbl": desc_lbl,
                "model": m,
            }

            for w in [card, top_row, bottom_row, name_lbl, action_btn, compat_lbl, desc_lbl]:
                w.bind("<MouseWheel>", mousewheel_handler)

        self._refresh_all_model_cards()

    def _refresh_all_model_cards(self) -> None:
        """Update visual state and action buttons for every model card in the drawer."""
        for m in AVAILABLE_MODELS:
            self._refresh_model_card(m["id"])

    def _refresh_model_card(self, model_id: str) -> None:
        """Update single model card styling and action button based on download status."""
        widgets = self.card_widgets.get(model_id)
        if not widgets:
            return

        card = widgets["card"]
        top = widgets["top"]
        bottom = widgets["bottom"]
        name_lbl = widgets["name_lbl"]
        action_btn = widgets["action_btn"]
        compat_lbl = widgets["compat_lbl"]
        desc_lbl = widgets["desc_lbl"]
        m = widgets["model"]

        is_active = (model_id == self.current_model)
        is_downloading = (model_id in self.downloading_models)
        is_cached = check_is_cached(model_id)

        action_btn.unbind("<Button-1>")
        action_btn.unbind("<Enter>")
        action_btn.unbind("<Leave>")
        card.unbind("<Button-1>")

        if is_downloading:
            prog_text = self.downloading_models[model_id]
            card_bg = THEME["bg_card_downloading"]
            name_lbl.config(
                text=f"⏳ {m['name']}  ·  {m['size_str']}",
                fg=THEME["text_primary"],
                bg=card_bg,
                font=("Segoe UI", 8, "bold"),
            )
            desc_lbl.config(text="Downloading weights...", fg=THEME["accent_amber"], bg=card_bg, font=("Segoe UI", 7, "italic"))
            action_btn.config(
                text=f"⏳ {prog_text}",
                bg=THEME["bg_card"],
                fg=THEME["accent_amber"],
                relief="solid",
                bd=1,
                cursor="wait",
            )
        elif is_active:
            card_bg = THEME["bg_card_active"]
            name_lbl.config(
                text=f"⚡ {m['name']}  ·  {m['size_str']}",
                fg=THEME["text_primary"],
                bg=card_bg,
                font=("Segoe UI", 8, "bold"),
            )
            desc_lbl.config(text="✓ In Use · Active Engine", fg=THEME["accent_green"], bg=card_bg, font=("Segoe UI", 7, "bold"))
            action_btn.config(
                text="✓ Active",
                bg=THEME["text_primary"],
                fg=THEME["bg_card"],
                relief="flat",
                bd=0,
                cursor="arrow",
            )
        elif is_cached:
            card_bg = THEME["bg_card"]
            name_lbl.config(
                text=f"💾 {m['name']}  ·  {m['size_str']}",
                fg=THEME["text_primary"],
                bg=card_bg,
                font=("Segoe UI", 8, "bold"),
            )
            desc_lbl.config(text="Local · Ready to Use", fg=THEME["accent_green"], bg=card_bg, font=("Segoe UI", 7))
            action_btn.config(
                text="Select Model",
                bg=THEME["bg_card"],
                fg=THEME["text_primary"],
                relief="solid",
                bd=1,
                cursor="hand2",
            )
            action_btn.bind("<Button-1>", lambda e, mid=model_id: self._select_model(mid))
            bind_hover(action_btn, THEME["bg_card"], THEME["text_primary"], THEME["text_primary"], THEME["bg_card"])
            card.bind("<Button-1>", lambda e, mid=model_id: self._select_model(mid))
        else:
            card_bg = THEME["bg_card_uninstalled"]
            name_lbl.config(
                text=f"☁️ {m['name']}  ·  {m['size_str']}",
                fg="#6E5B51",
                bg=card_bg,
                font=("Segoe UI", 8),
            )
            desc_lbl.config(text="☁️ Not Installed · In Cloud", fg=THEME["text_subtle"], bg=card_bg, font=("Segoe UI", 7, "italic"))
            action_btn.config(
                text="⬇ Download Model",
                bg=THEME["btn_uninstalled_bg"],
                fg=THEME["text_primary"],
                relief="solid",
                bd=1,
                cursor="hand2",
            )
            action_btn.bind("<Button-1>", lambda e, mid=model_id: self._start_model_download(mid))
            bind_hover(action_btn, THEME["btn_uninstalled_bg"], THEME["btn_uninstalled_hover"], THEME["text_primary"], "#1A130E")
            card.bind("<Button-1>", lambda e, mid=model_id: self._start_model_download(mid))

        card.config(bg=card_bg)
        top.config(bg=card_bg)
        bottom.config(bg=card_bg)
        compat_lbl.config(bg=card_bg)

    # -------------------------------------------------------------------------
    # Drag Handling
    # -------------------------------------------------------------------------
    def _bind_drag_events(self) -> None:
        """Allow dragging floating pill across the monitor."""
        drag_targets = [
            self.container,
            self.card,
            self.title_label,
            self.status_label,
            self.text_frame,
            self.settings_drawer,
        ]
        for widget in drag_targets:
            widget.bind("<ButtonPress-1>", self._on_drag_start)
            widget.bind("<B1-Motion>", self._on_drag_motion)

    def _on_drag_start(self, event) -> None:
        self._drag_start_x = event.x_root - self.root.winfo_x()
        self._drag_start_y = event.y_root - self.root.winfo_y()

    def _on_drag_motion(self, event) -> None:
        x = event.x_root - self._drag_start_x
        y = event.y_root - self._drag_start_y
        self.root.geometry(f"+{x}+{y}")

    # -------------------------------------------------------------------------
    # Settings Drawer Toggle
    # -------------------------------------------------------------------------
    def open_settings(self) -> None:
        if self.is_settings_open:
            return
        self.is_settings_open = True
        self.settings_btn.config(fg=THEME["accent_red"], bg=THEME["bg_card_hover"])
        self.drawer_divider.pack(fill="x", side="top")
        self.settings_drawer.pack(fill="both", expand=True, side="top")
        cur_x, cur_y = self.root.winfo_x(), self.root.winfo_y()
        self.root.geometry(f"{PILL_WIDTH}x{EXPANDED_HEIGHT}+{cur_x}+{cur_y}")
        self._refresh_all_model_cards()

    def close_settings(self) -> None:
        if not self.is_settings_open:
            return
        self.is_settings_open = False
        self.settings_btn.config(fg=THEME["text_subtle"], bg=THEME["bg_card"])
        self.drawer_divider.pack_forget()
        self.settings_drawer.pack_forget()
        cur_x, cur_y = self.root.winfo_x(), self.root.winfo_y()
        self.root.geometry(f"{PILL_WIDTH}x{PILL_HEIGHT}+{cur_x}+{cur_y}")

    def toggle_settings(self) -> None:
        if self.is_settings_open:
            self.close_settings()
        else:
            self.open_settings()

    def _on_lang_menu_changed(self, selected_label: str) -> None:
        target_lang = "en"
        for lbl, key in AVAILABLE_LANGUAGES:
            if lbl == selected_label:
                target_lang = key
                break
        self.current_language = target_lang
        self._save_settings()
        logger.info("Spoken language changed to: %s", target_lang)

    # -------------------------------------------------------------------------
    # Model Loading & Switching
    # -------------------------------------------------------------------------
    def _select_model(self, model_id: str) -> None:
        if model_id == self.current_model:
            return
        if not check_is_cached(model_id):
            self.status_label.config(text=f"Please download {model_id} first")
            self._start_model_download(model_id)
            return

        self.current_model = model_id
        self._save_settings()
        self._refresh_all_model_cards()
        self._switch_model(model_id)

    def _start_model_download(self, model_id: str) -> None:
        if model_id in self.downloading_models:
            return

        self.downloading_models[model_id] = "Connecting..."
        self._refresh_model_card(model_id)
        self.status_label.config(text=f"Downloading {model_id}...")

        def _worker():
            try:
                engine_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "yapper-engine"))
                if engine_path not in sys.path:
                    sys.path.insert(0, engine_path)
                from src.engine.model_loader import ensure_model_ready

                def _prog(pct, msg):
                    pct_str = f"{int(pct * 100)}%"
                    self.downloading_models[model_id] = pct_str
                    self._run_on_ui(lambda: self._refresh_model_card(model_id))
                    self._run_on_ui(lambda: self.status_label.config(text=f"Fetching {model_id} ({pct_str})..."))

                ensure_model_ready(model_id, progress_callback=_prog)
                self.downloading_models.pop(model_id, None)

                def _on_done():
                    self._refresh_all_model_cards()
                    self.status_label.config(text=f"✓ {model_id} downloaded!")
                    self.root.after(2500, self._reset_ui_idle)

                self._run_on_ui(_on_done)
            except Exception as exc:
                logger.error("Download failed for '%s': %s", model_id, exc)
                self.downloading_models.pop(model_id, None)
                def _on_err():
                    self._refresh_model_card(model_id)
                    self.status_label.config(text=f"Error downloading {model_id}")
                    self.root.after(3000, self._reset_ui_idle)
                self._run_on_ui(_on_err)

        threading.Thread(target=_worker, daemon=True).start()

    def _switch_model(self, target_model: str) -> None:
        old_model = self.current_model
        self.current_model = target_model
        self._save_settings()

        self.is_model_ready = False
        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_amber"], outline=THEME["accent_amber_border"])
        self.status_label.config(text=f"Loading {target_model}...")
        self._refresh_all_model_cards()

        def _worker():
            try:
                engine_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "yapper-engine"))
                if engine_path not in sys.path:
                    sys.path.insert(0, engine_path)
                from src.engine.model_loader import ensure_model_ready
                from src.engine.transcription import get_transcriber

                def _prog(pct, msg):
                    self._run_on_ui(lambda: self.status_label.config(text=f"{msg}"))

                ensure_model_ready(target_model, progress_callback=_prog)
                transcriber = get_transcriber(model_size=target_model)
                if hasattr(transcriber, "_get_model"):
                    transcriber._get_model()

                def _on_ready():
                    self._set_model_ready()
                    self._refresh_all_model_cards()
                    logger.info("Switched to model '%s' successfully.", target_model)

                self._run_on_ui(_on_ready)
            except Exception as exc:
                logger.error("Failed to load model '%s': %s", target_model, exc)
                def _on_fail():
                    self.status_label.config(text=f"Error loading {target_model}")
                    self.current_model = old_model
                    self._set_model_ready()
                    self._refresh_all_model_cards()
                self._run_on_ui(_on_fail)

        threading.Thread(target=_worker, daemon=True).start()

    def _prewarm_model_pipeline(self) -> None:
        """Pre-warm model weights on launch so speech transcription is instant."""
        try:
            if self.transcriber.check_health():
                logger.info("Connected to Yapper Engine HTTP backend.")
                self._run_on_ui(self._set_model_ready)
                return

            self._run_on_ui(lambda: self.status_label.config(text=f"Verifying {self.current_model}..."))
            engine_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "yapper-engine"))
            if engine_path not in sys.path:
                sys.path.insert(0, engine_path)
            from src.engine.transcription import get_transcriber
            from src.engine.model_loader import ensure_model_ready

            def _prog(pct, msg):
                self._run_on_ui(lambda: self.status_label.config(text=f"{msg}"))

            ensure_model_ready(self.current_model, progress_callback=_prog)
            transcriber = get_transcriber(model_size=self.current_model)
            if hasattr(transcriber, "_get_model"):
                self._run_on_ui(lambda: self.status_label.config(text=f"Loading {self.current_model}..."))
                transcriber._get_model()

            self._run_on_ui(self._set_model_ready)
        except Exception as exc:
            logger.warning("Pre-warm completed with notice: %s", exc)
            self._run_on_ui(self._set_model_ready)

    def _set_model_ready(self) -> None:
        self.is_model_ready = True
        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_red"], outline=THEME["accent_red_border"])
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.title_label.config(text="Yapper", fg=THEME["text_primary"])
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to record")
        if self.card_widgets:
            self._refresh_all_model_cards()

    # -------------------------------------------------------------------------
    # Recording Control Lifecycle
    # -------------------------------------------------------------------------
    def toggle_recording(self) -> None:
        if not self.is_model_ready:
            self.status_label.config(text="Model warming up, please wait...")
            return

        if not self.recorder.is_recording:
            self.start_recording()
        else:
            self.stop_recording()

    def start_recording(self) -> None:
        if self.recorder.is_recording:
            return
        if self.is_settings_open:
            self.close_settings()

        try:
            self.recorder.start()
        except Exception:
            self.status_label.config(text="Mic Error!")
            return

        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_red_hover"], outline=THEME["accent_red_pulse"])
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="normal")
        self.title_label.config(text="Listening...", fg=THEME["accent_red"])
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to stop")
        self.cancel_btn.pack(side="right", padx=(2, 4))
        self._start_recording_pulse()

    def _start_recording_pulse(self) -> None:
        self._pulse_state = False
        self._pulse_tick()

    def _pulse_tick(self) -> None:
        if not self.recorder.is_recording:
            return
        self._pulse_state = not self._pulse_state
        fill_col = THEME["accent_red_hover"] if self._pulse_state else THEME["accent_red"]
        outline_col = THEME["accent_red_pulse"] if self._pulse_state else THEME["accent_red_border"]
        self.orb_btn.itemconfig(self.orb_circle, fill=fill_col, outline=outline_col)
        self.root.after(450, self._pulse_tick)

    def cancel_recording(self) -> None:
        if not self.recorder.is_recording:
            return
        self.recorder.cancel()
        self.cancel_btn.pack_forget()

        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["text_subtle"], outline="#5C4D44")
        self.title_label.config(text="Yapper", fg=THEME["text_primary"])
        self.status_label.config(text="Cancelled")
        self.root.after(700, self._reset_ui_idle)

    def stop_recording(self) -> None:
        if not self.recorder.is_recording:
            return

        result = self.recorder.stop()
        self.cancel_btn.pack_forget()

        if result is None:
            self._reset_ui_idle()
            return

        wav_bytes, pcm_bytes = result
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_amber"], outline=THEME["accent_amber_border"])
        self.title_label.config(text="Flow Inking...", fg=THEME["accent_amber"])
        self.status_label.config(text="Transcribing & typing...")

        threading.Thread(target=self._process_pipeline, args=(wav_bytes, pcm_bytes), daemon=True).start()

    def _process_pipeline(self, wav_bytes: bytes, pcm_bytes: bytes) -> None:
        try:
            final_text = self.transcriber.transcribe(
                wav_bytes=wav_bytes,
                pcm_bytes=pcm_bytes,
                language=self.current_language,
                model=self.current_model,
            )
            self._run_on_ui(lambda: self._on_transcription_finished(final_text))
        except Exception as exc:
            logger.error("Processing pipeline error: %s", exc, exc_info=True)
            self._run_on_ui(self._reset_ui_idle)

    def _on_transcription_finished(self, final_text: str) -> None:
        if final_text:
            logger.info("Transcribed text: %s", final_text)
            self.title_label.config(text="Pasting...", fg=THEME["text_primary"])
            self.injector.inject_text(final_text, root_window=self.root, on_complete=self._reset_ui_idle)
        else:
            logger.info("No speech detected or empty transcription.")
            self._reset_ui_idle()

    def _reset_ui_idle(self) -> None:
        self.cancel_btn.pack_forget()
        self.orb_btn.itemconfigure(self.orb_stop_icon, state="hidden")
        self.orb_btn.itemconfig(self.orb_circle, fill=THEME["accent_red"], outline=THEME["accent_red_border"])
        self.title_label.config(text="Yapper", fg=THEME["text_primary"])
        self.status_label.config(text=f"{DEFAULT_HOTKEY_LABEL} to record")

    def _on_escape_pressed(self, event=None) -> None:
        if self.recorder.is_recording:
            self.cancel_recording()
        elif self.is_settings_open:
            self.close_settings()
        else:
            self.quit_app()

    def quit_app(self) -> None:
        if self.recorder.is_recording:
            self.recorder.cancel()
        self.hotkey_listener.stop()
        self.root.destroy()
        sys.exit(0)

    def run(self) -> None:
        self.root.mainloop()


def run_hud() -> None:
    """Convenience launcher for Yapper Desktop HUD."""
    from .config import IS_MAC
    os_name = "macOS" if IS_MAC else "Windows"
    print("==================================================================")
    print(f" 🎙️ YAPPER DESKTOP VOICE HUD ({os_name} · Universal Voice Dictation)")
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
