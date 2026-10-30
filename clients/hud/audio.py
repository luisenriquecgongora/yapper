"""Audio recording subsystem managing sounddevice microphone streams."""

import io
import logging
import threading
import wave
from typing import List, Optional, Tuple
import numpy as np
import sounddevice as sd

from .config import AUDIO_BLOCKSIZE, AUDIO_CHANNELS, AUDIO_DTYPE, MIN_PCM_BYTES, SAMPLE_RATE

logger = logging.getLogger("yapper.hud.audio")


class AudioRecorder:
    """Manages audio capture lifecycle, PCM frame buffering, and WAV packaging."""

    def __init__(self) -> None:
        self._stream: Optional[sd.InputStream] = None
        self._frames: List[np.ndarray] = []
        self._lock = threading.Lock()
        self._is_recording = False

    @property
    def is_recording(self) -> bool:
        return self._is_recording

    def start(self) -> None:
        """Start capturing audio from the default input device."""
        with self._lock:
            if self._is_recording:
                return

            self._frames.clear()
            self._is_recording = True

            try:
                self._stream = sd.InputStream(
                    samplerate=SAMPLE_RATE,
                    channels=AUDIO_CHANNELS,
                    dtype=AUDIO_DTYPE,
                    callback=self._audio_callback,
                    blocksize=AUDIO_BLOCKSIZE,
                )
                self._stream.start()
                logger.info("Microphone audio stream started successfully.")
            except Exception as exc:
                self._is_recording = False
                self._stream = None
                logger.error("Failed to initialize audio input device: %s", exc)
                raise

    def _audio_callback(self, indata: np.ndarray, frames: int, time_info: dict, status: sd.CallbackFlags) -> None:
        """Invoked by PortAudio whenever a chunk of audio frames is ready."""
        if self._is_recording:
            with self._lock:
                self._frames.append(indata.copy())

    def stop(self) -> Optional[Tuple[bytes, bytes]]:
        """Stop capturing and return (wav_bytes, pcm_bytes), or None if audio was too short."""
        with self._lock:
            if not self._is_recording:
                return None

            self._is_recording = False
            captured_frames = list(self._frames)
            self._frames.clear()

        # Stop stream outside the buffer lock
        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception as exc:
                logger.warning("Error stopping audio stream: %s", exc)
            self._stream = None

        if not captured_frames:
            return None

        # Concatenate PCM frames
        audio_np = np.concatenate(captured_frames, axis=0)
        pcm_bytes = audio_np.tobytes()

        # Suppress tiny audio (< 0.25s)
        if len(pcm_bytes) < MIN_PCM_BYTES:
            logger.info("Recorded audio segment too short (< 0.25s). Discarding.")
            return None

        # Encode into standard WAV bytes
        wav_buf = io.BytesIO()
        with wave.open(wav_buf, "wb") as wf:
            wf.setnchannels(AUDIO_CHANNELS)
            wf.setsampwidth(2)
            wf.setframerate(SAMPLE_RATE)
            wf.writeframes(pcm_bytes)
        wav_bytes = wav_buf.getvalue()

        return wav_bytes, pcm_bytes

    def cancel(self) -> None:
        """Immediately abort recording and discard all accumulated frames."""
        with self._lock:
            self._is_recording = False
            self._frames.clear()

        if self._stream:
            try:
                self._stream.stop()
                self._stream.close()
            except Exception:
                pass
            self._stream = None
        logger.info("Audio recording cancelled. Buffer discarded.")
