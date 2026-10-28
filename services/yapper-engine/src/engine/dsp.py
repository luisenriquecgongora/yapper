"""Digital Signal Processing (DSP) and spectral noise reduction module.

Implements real-time spectral subtraction via Short-Time Fourier Transform (STFT),
noise profile tracking, and acoustic Signal-to-Noise Ratio (SNR) evaluation.
"""

import math
import logging
from typing import Optional, Tuple
import numpy as np

logger = logging.getLogger(__name__)


class SpectralDenoisingFilter:
    """Real-time streaming spectral subtraction filter for 16kHz mono audio.

    Suppresses stationary ambient noise (HVAC hum, fan whirl, background hiss)
    by subtracting an estimated noise power spectrum from the Short-Time Fourier Transform.
    """

    def __init__(
        self,
        sample_rate: int = 16000,
        frame_size: int = 512,  # 32ms at 16kHz
        hop_size: int = 256,    # 16ms (50% overlap)
        alpha: float = 2.0,     # Over-subtraction factor
        beta: float = 0.02,     # Spectral floor to prevent musical noise
    ) -> None:
        self.sample_rate = sample_rate
        self.frame_size = frame_size
        self.hop_size = hop_size
        self.alpha = alpha
        self.beta = beta

        # Pre-compute Hann window
        self.window = np.hanning(self.frame_size).astype(np.float32)

        # Running noise magnitude spectrum estimation
        self.noise_magnitude: Optional[np.ndarray] = None
        self._noise_frames_accumulated: int = 0

    def estimate_noise_profile(self, noise_audio: np.ndarray) -> None:
        """Estimate the stationary noise magnitude spectrum from a known silence/noise segment."""
        if len(noise_audio) < self.frame_size:
            return

        magnitudes = []
        for i in range(0, len(noise_audio) - self.frame_size + 1, self.hop_size):
            frame = noise_audio[i : i + self.frame_size] * self.window
            spec = np.fft.rfft(frame)
            magnitudes.append(np.abs(spec))

        if magnitudes:
            self.noise_magnitude = np.mean(magnitudes, axis=0)
            self._noise_frames_accumulated = len(magnitudes)

    def denoise_float32(self, audio: np.ndarray) -> np.ndarray:
        """Apply spectral subtraction to a normalized float32 audio array in [-1.0, 1.0]."""
        if len(audio) < self.frame_size:
            return audio

        # Auto-initialize noise profile from initial 100ms (1600 samples) if not yet calibrated
        if self.noise_magnitude is None:
            init_samples = min(len(audio), 3200)
            self.estimate_noise_profile(audio[:init_samples])

        num_frames = (len(audio) - self.frame_size) // self.hop_size + 1
        output_len = (num_frames - 1) * self.hop_size + self.frame_size
        output = np.zeros(output_len, dtype=np.float32)
        window_sum = np.zeros(output_len, dtype=np.float32)

        noise_mag_sq = (self.noise_magnitude**2) if self.noise_magnitude is not None else 0.0

        for i in range(num_frames):
            start = i * self.hop_size
            end = start + self.frame_size
            frame = audio[start:end] * self.window

            # Forward Short-Time Fourier Transform
            spec = np.fft.rfft(frame)
            mag = np.abs(spec)
            phase = np.angle(spec)

            # Power spectral subtraction
            power = mag**2
            subtracted_power = power - self.alpha * noise_mag_sq

            # Apply spectral floor beta to prevent "musical noise" artifacts
            cleaned_mag = np.sqrt(np.maximum(subtracted_power, (self.beta**2) * power))

            # Reconstruct complex spectrum with original acoustic phase
            cleaned_spec = cleaned_mag * np.exp(1j * phase)

            # Inverse STFT
            reconstructed_frame = np.fft.irfft(cleaned_spec, n=self.frame_size) * self.window

            # Overlap-add (OLA) synthesis
            output[start:end] += reconstructed_frame
            window_sum[start:end] += self.window**2

        # Normalize overlapping window attenuation
        nonzero_mask = window_sum > 1e-6
        output[nonzero_mask] /= window_sum[nonzero_mask]

        # Preserve original array length
        if len(output) < len(audio):
            output = np.pad(output, (0, len(audio) - len(output)))
        else:
            output = output[: len(audio)]

        return np.clip(output, -1.0, 1.0)

    def denoise_pcm(self, pcm_bytes: bytes) -> bytes:
        """Denoise raw 16kHz 16-bit mono PCM bytes."""
        if not pcm_bytes:
            return b""
        int16_arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        audio_float = int16_arr.astype(np.float32) / 32768.0
        cleaned_float = self.denoise_float32(audio_float)
        cleaned_int16 = (cleaned_float * 32767.0).astype(np.int16)
        return cleaned_int16.tobytes()


# ==============================================================================
# Synthetic Acoustic Utilities & SNR Evaluation
# ==============================================================================


def calculate_snr_db(clean_signal: np.ndarray, noisy_signal: np.ndarray) -> float:
    """Calculate the Signal-to-Noise Ratio (SNR) in decibels (dB).

    SNR = 10 * log10(P_signal / P_noise)
    """
    min_len = min(len(clean_signal), len(noisy_signal))
    if min_len == 0:
        return 0.0

    s = clean_signal[:min_len]
    noise = noisy_signal[:min_len] - s

    signal_power = np.mean(s**2)
    noise_power = np.mean(noise**2)

    if noise_power <= 1e-10:
        return 100.0  # Essentially infinite SNR
    if signal_power <= 1e-10:
        return -100.0

    return float(10.0 * np.log10(signal_power / noise_power))


def inject_white_noise(pcm_bytes: bytes, target_snr_db: float = 15.0) -> bytes:
    """Inject synthetic Gaussian white noise into 16-bit PCM at a precise target SNR (dB)."""
    if not pcm_bytes:
        return b""

    int16_arr = np.frombuffer(pcm_bytes, dtype=np.int16)
    signal = int16_arr.astype(np.float32) / 32768.0

    signal_power = np.mean(signal**2)
    if signal_power < 1e-8:
        # Pure silence; generate low-level noise floor
        noise = np.random.normal(0, 0.01, len(signal)).astype(np.float32)
        noisy = np.clip(noise, -1.0, 1.0)
        return (noisy * 32767.0).astype(np.int16).tobytes()

    target_noise_power = signal_power / (10.0 ** (target_snr_db / 10.0))
    noise = np.random.normal(0, np.sqrt(target_noise_power), len(signal)).astype(np.float32)

    noisy = np.clip(signal + noise, -1.0, 1.0)
    return (noisy * 32767.0).astype(np.int16).tobytes()


def inject_mains_hum(pcm_bytes: bytes, hum_freq: float = 60.0, target_snr_db: float = 12.0) -> bytes:
    """Inject synthetic electrical 60Hz mains hum and harmonic overtones."""
    if not pcm_bytes:
        return b""

    int16_arr = np.frombuffer(pcm_bytes, dtype=np.int16)
    signal = int16_arr.astype(np.float32) / 32768.0
    num_samples = len(signal)
    t = np.arange(num_samples) / 16000.0

    # Fundamental (60Hz) + 2nd harmonic (120Hz) + 3rd harmonic (180Hz)
    hum = (
        0.7 * np.sin(2 * np.pi * hum_freq * t)
        + 0.2 * np.sin(2 * np.pi * hum_freq * 2 * t)
        + 0.1 * np.sin(2 * np.pi * hum_freq * 3 * t)
    ).astype(np.float32)

    signal_power = np.mean(signal**2)
    hum_power = np.mean(hum**2)

    if signal_power > 1e-8 and hum_power > 1e-8:
        scale = np.sqrt(signal_power / (hum_power * (10.0 ** (target_snr_db / 10.0))))
        hum *= scale

    noisy = np.clip(signal + hum, -1.0, 1.0)
    return (noisy * 32767.0).astype(np.int16).tobytes()
