"""Low-footprint Voice Activity Detection (VAD) using Silero VAD ONNX runtime.

Provides sub-30ms voice activity probability computation with internal RNN
hidden state tracking and graceful adaptive energy VAD fallback.
"""

import logging
import math
import os
from pathlib import Path
from typing import Optional, Tuple
import numpy as np

try:
    import onnxruntime as ort
except ImportError:
    ort = None  # type: ignore

logger = logging.getLogger(__name__)

# Default Silero VAD model URL (v5 lightweight ONNX, ~1.8 MB)
SILERO_VAD_URL = "https://github.com/snakers4/silero-vad/raw/master/src/silero_vad/data/silero_vad.onnx"
DEFAULT_CACHE_DIR = Path.home() / ".cache" / "yapper"


class SileroVAD:
    """Voice Activity Detector wrapping Silero VAD ONNX with internal state memory.

    Accepts 16kHz 16-bit mono PCM chunks and returns speech probability in [0.0, 1.0].
    """

    def __init__(
        self,
        model_path: Optional[str] = None,
        sample_rate: int = 16000,
        threshold: float = 0.5,
    ) -> None:
        self.sample_rate = sample_rate
        self.threshold = threshold
        self.session: Optional["ort.InferenceSession"] = None
        self.is_v5: bool = True

        # State tensors for Silero VAD
        # v5 uses single 'state' of shape (2, 1, 128)
        # v4 uses 'h' and 'c' of shape (2, 1, 64)
        self._state_v5: np.ndarray = np.zeros((2, 1, 128), dtype=np.float32)
        self._h_v4: np.ndarray = np.zeros((2, 1, 64), dtype=np.float32)
        self._c_v4: np.ndarray = np.zeros((2, 1, 64), dtype=np.float32)

        # Fallback energy baseline
        self._noise_floor: float = 0.01

        self._init_session(model_path)

    def _init_session(self, model_path: Optional[str]) -> None:
        if ort is None:
            logger.warning("onnxruntime is not installed. Falling back to adaptive energy VAD.")
            return

        resolved_path = self._resolve_model_path(model_path)
        if not resolved_path or not os.path.exists(resolved_path):
            logger.warning(
                "Silero VAD ONNX model not found on disk. Operating with adaptive energy VAD fallback."
            )
            return

        try:
            opts = ort.SessionOptions()
            opts.inter_op_num_threads = 1
            opts.intra_op_num_threads = 1
            opts.log_severity_level = 3  # Error only

            self.session = ort.InferenceSession(resolved_path, sess_options=opts, providers=["CPUExecutionProvider"])
            input_names = [inp.name for inp in self.session.get_inputs()]
            self.is_v5 = "state" in input_names
            logger.info("Silero VAD initialized successfully via ONNX Runtime (v5 format: %s)", self.is_v5)
        except Exception as exc:
            logger.warning("Failed to initialize Silero VAD session (%s). Using energy fallback.", exc)
            self.session = None

    def _resolve_model_path(self, model_path: Optional[str]) -> Optional[str]:
        if model_path and os.path.exists(model_path):
            return model_path

        # Check default cache directory
        cache_path = DEFAULT_CACHE_DIR / "silero_vad.onnx"
        if cache_path.exists():
            return str(cache_path)

        # Check local package directory
        local_path = Path(__file__).parent.parent / "models" / "silero_vad.onnx"
        if local_path.exists():
            return str(local_path)

        # Attempt to auto-download model once
        try:
            import urllib.request

            DEFAULT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
            logger.info("Downloading Silero VAD ONNX model from upstream repository...")
            urllib.request.urlretrieve(SILERO_VAD_URL, str(cache_path))
            if cache_path.exists():
                logger.info("Silero VAD model cached at %s", cache_path)
                return str(cache_path)
        except Exception as dl_err:
            logger.debug("Automatic model download skipped or failed: %s", dl_err)

        return None

    def reset_state(self) -> None:
        """Reset internal recurrent neural network state memory."""
        self._state_v5.fill(0)
        self._h_v4.fill(0)
        self._c_v4.fill(0)

    def pcm_to_float32(self, pcm_bytes: bytes) -> np.ndarray:
        """Convert raw 16-bit signed PCM byte stream to normalized float32 array in [-1.0, 1.0]."""
        if not pcm_bytes:
            return np.zeros(0, dtype=np.float32)
        int16_arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        return int16_arr.astype(np.float32) / 32768.0

    def compute_rms(self, audio: np.ndarray) -> float:
        """Calculate Root Mean Square (RMS) energy."""
        if len(audio) == 0:
            return 0.0
        return float(np.sqrt(np.mean(np.square(audio))))

    def process_chunk(self, chunk_pcm: bytes) -> float:
        """Evaluate a raw 16kHz PCM audio chunk and return the speech probability [0.0, 1.0].

        Accepts any buffer size; pads or splits in standard 512-sample (32ms) windows for the model.
        """
        audio = self.pcm_to_float32(chunk_pcm)
        if len(audio) == 0:
            return 0.0

        if self.session is None:
            # Fallback to adaptive energy VAD
            rms = self.compute_rms(audio)
            # Adapt noise floor slowly during silence
            if rms < self._noise_floor:
                self._noise_floor = 0.95 * self._noise_floor + 0.05 * rms
            else:
                self._noise_floor = 0.999 * self._noise_floor + 0.001 * rms

            ratio = rms / (self._noise_floor + 1e-5)
            # Sigmoidal mapping of SNR to probability
            prob = 1.0 / (1.0 + math.exp(-0.8 * (ratio - 2.5)))
            return float(np.clip(prob, 0.0, 1.0))

        # Standard window for Silero is 512 samples at 16kHz
        window_size = 512
        if len(audio) < window_size:
            audio = np.pad(audio, (0, window_size - len(audio)))

        # Process in 512 sample windows and take maximum speech probability
        max_prob = 0.0
        sr_tensor = np.array(self.sample_rate, dtype=np.int64)

        for i in range(0, len(audio), window_size):
            window = audio[i : i + window_size]
            if len(window) < window_size:
                window = np.pad(window, (0, window_size - len(window)))

            window_tensor = np.expand_dims(window, axis=0)  # Shape: (1, 512)

            try:
                if self.is_v5:
                    ort_inputs = {
                        "input": window_tensor,
                        "state": self._state_v5,
                        "sr": sr_tensor,
                    }
                    out, state = self.session.run(None, ort_inputs)
                    self._state_v5 = state
                    prob = float(out[0][0])
                else:
                    ort_inputs = {
                        "input": window_tensor,
                        "sr": sr_tensor,
                        "h": self._h_v4,
                        "c": self._c_v4,
                    }
                    out, h, c = self.session.run(None, ort_inputs)
                    self._h_v4 = h
                    self._c_v4 = c
                    prob = float(out[0][0])

                if prob > max_prob:
                    max_prob = prob
            except Exception as run_err:
                logger.debug("Silero inference step exception: %s", run_err)
                return self.compute_rms(audio) > 0.03

        return float(np.clip(max_prob, 0.0, 1.0))

    def is_speech(self, chunk_pcm: bytes) -> bool:
        """Return True if speech probability strictly satisfies the configured threshold."""
        return self.process_chunk(chunk_pcm) >= self.threshold
