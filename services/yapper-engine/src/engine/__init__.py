"""Engine subpackage containing VAD, DSP, transcription, and formatting modules."""

from .vad import SileroVAD
from .dsp import SpectralDenoisingFilter, calculate_snr_db, inject_white_noise, inject_mains_hum
from .hallucination import HallucinationGuard
from .transcription import (
    BaseTranscriber,
    OpenAICompatibleTranscriber,
    GroqTranscriber,
    LocalFasterWhisperTranscriber,
    get_transcriber,
)
from .formatter import FlowFormatter

__all__ = [
    "SileroVAD",
    "SpectralDenoisingFilter",
    "calculate_snr_db",
    "inject_white_noise",
    "inject_mains_hum",
    "HallucinationGuard",
    "BaseTranscriber",
    "OpenAICompatibleTranscriber",
    "GroqTranscriber",
    "LocalFasterWhisperTranscriber",
    "get_transcriber",
    "FlowFormatter",
]
