"""Unified Audio Transcription and Post-Processing Pipeline.

Encapsulates DSP denoising, ASR speech decoding, hallucination suppression,
and conversational formatting into a single cohesive, reusable domain service (DRY & SRP).
"""

import logging
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..config import settings
from .dsp import SpectralDenoisingFilter
from .formatter import FlowFormatter
from .hallucination import HallucinationGuard
from .transcription import BaseTranscriber, get_transcriber

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class PipelineResult:
    """Immutable result produced by the transcription pipeline."""
    text: str
    raw: str
    duration_ms: int
    backend: str
    action: Optional[Dict[str, Any]] = None


class TranscriptionPipeline:
    """Cohesive audio-to-text pipeline adhering to SOLID & DRY principles.

    Sequence:
    1. Spectral denoising (optional DSP noise suppression)
    2. ASR speech-to-text transcription (Local Whisper / Groq / OpenAI)
    3. Hallucination guard (Shannon entropy & Kolmogorov sequence filter)
    4. Conversational formatting (FlowFormatter filler removal / action extraction)
    """

    def __init__(
        self,
        sample_rate: int = settings.SAMPLE_RATE,
        default_denoise: bool = True,
    ) -> None:
        self.sample_rate = sample_rate
        self.default_denoise = default_denoise
        self._denoiser = SpectralDenoisingFilter(sample_rate=sample_rate)
        self._guard = HallucinationGuard()
        self._formatter = FlowFormatter()

    async def process(
        self,
        pcm_bytes: bytes,
        language: str = "en",
        mode: str = "flow",
        denoise: Optional[bool] = None,
        model: Optional[str] = None,
        action_schema: Optional[Dict[str, Any]] = None,
        transcriber: Optional[BaseTranscriber] = None,
    ) -> PipelineResult:
        """Execute the end-to-end audio processing pipeline on raw 16kHz 16-bit PCM bytes."""
        t0 = time.perf_counter()

        should_denoise = self.default_denoise if denoise is None else denoise

        # 1. DSP Spectral Denoising
        audio_pcm = pcm_bytes
        if should_denoise and len(pcm_bytes) >= 1024:
            audio_pcm = self._denoiser.denoise_pcm(pcm_bytes)

        # 2. ASR Transcription
        active_transcriber = transcriber or get_transcriber(model_size=model)
        raw_asr = await active_transcriber.transcribe(audio_pcm, language=language)

        # 3. Filter Autoregressive Hallucinations
        raw_text = self._guard.filter_transcript(raw_asr)

        # 4. Post-Processing & Text Formatting
        formatted_text = raw_text
        extracted_action: Optional[Dict[str, Any]] = None

        if raw_text:
            if mode == "flow":
                formatted_text = await self._formatter.format_transcript(raw_text)
            elif mode == "action" and action_schema:
                extracted_action = await self._formatter.extract_action(raw_text, action_schema)
                formatted_text = await self._formatter.format_transcript(raw_text)

        elapsed_ms = int((time.perf_counter() - t0) * 1000)

        return PipelineResult(
            text=formatted_text,
            raw=raw_text,
            duration_ms=elapsed_ms,
            backend=settings.effective_backend,
            action=extracted_action,
        )
