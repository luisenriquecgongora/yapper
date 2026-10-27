"""Dual transcription providers supporting Groq Whisper Large v3 and Local Faster-Whisper."""

import abc
import asyncio
import io
import logging
import wave
from typing import Optional
import numpy as np

from ..config import settings

logger = logging.getLogger(__name__)


def pcm_to_wav_bytes(pcm_bytes: bytes, sample_rate: int = 16000, num_channels: int = 1, sampwidth: int = 2) -> bytes:
    """Convert raw 16-bit PCM bytes into an in-memory WAV byte stream with zero disk writes."""
    buffer = io.BytesIO()
    with wave.open(buffer, "wb") as wav_file:
        wav_file.setnchannels(num_channels)
        wav_file.setsampwidth(sampwidth)
        wav_file.setframerate(sample_rate)
        wav_file.writeframes(pcm_bytes)
    buffer.seek(0)
    return buffer.read()


class BaseTranscriber(abc.ABC):
    """Abstract base transcriber defining standard audio transcription contract."""

    @abc.abstractmethod
    async def transcribe(self, pcm_bytes: bytes, language: str = "en") -> str:
        """Transcribe raw 16kHz 16-bit mono PCM bytes into text."""
        pass


class GroqTranscriber(BaseTranscriber):
    """Ultra-low latency transcription provider using Groq's Whisper Large v3 cloud API."""

    def __init__(self, api_key: Optional[str] = None, model: str = "whisper-large-v3") -> None:
        self.api_key = api_key or settings.GROQ_API_KEY
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not self.api_key:
                raise ValueError("GROQ_API_KEY is not set. Please provide a key or switch to local inference.")
            from groq import AsyncGroq

            self._client = AsyncGroq(api_key=self.api_key)
        return self._client

    async def transcribe(self, pcm_bytes: bytes, language: str = "en") -> str:
        if not pcm_bytes or len(pcm_bytes) < 3200:  # < 0.1s of 16kHz 16-bit PCM
            return ""

        client = self._get_client()
        wav_bytes = pcm_to_wav_bytes(pcm_bytes, sample_rate=settings.SAMPLE_RATE)

        try:
            # Send in-memory virtual file tuple: (filename, bytes, content_type)
            response = await client.audio.transcriptions.create(
                file=("speech.wav", wav_bytes, "audio/wav"),
                model=self.model,
                language=language if language and language != "auto" else None,
                response_format="json",
                temperature=0.0,
            )
            raw_text = getattr(response, "text", "") or ""
            return raw_text.strip()
        except Exception as exc:
            logger.error("Groq Whisper transcription API failed: %s", exc)
            raise


class LocalFasterWhisperTranscriber(BaseTranscriber):
    """Zero-cloud, self-hosted transcription provider using CTranslate2 faster-whisper."""

    def __init__(
        self,
        model_size: str = "tiny.en",
        device: str = "cpu",
        compute_type: str = "int8",
    ) -> None:
        self.model_size = model_size
        self.device = device
        self.compute_type = compute_type
        self._model = None

    def _get_model(self):
        if self._model is None:
            logger.info(
                "Loading faster-whisper model '%s' on %s (%s)...",
                self.model_size,
                self.device,
                self.compute_type,
            )
            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                self.model_size,
                device=self.device,
                compute_type=self.compute_type,
            )
            logger.info("faster-whisper model '%s' loaded into memory.", self.model_size)
        return self._model

    def _sync_transcribe(self, pcm_bytes: bytes, language: str) -> str:
        int16_arr = np.frombuffer(pcm_bytes, dtype=np.int16)
        audio_float = int16_arr.astype(np.float32) / 32768.0

        model = self._get_model()
        segments, _info = model.transcribe(
            audio_float,
            language=language if language and language != "auto" else None,
            beam_size=1,  # Greedy decoding for low-latency streaming
            temperature=0.0,
            vad_filter=False,  # VAD gating is already performed upstream by SileroVAD
        )

        texts = [seg.text for seg in segments]
        return " ".join(texts).strip()

    async def transcribe(self, pcm_bytes: bytes, language: str = "en") -> str:
        if not pcm_bytes or len(pcm_bytes) < 3200:
            return ""

        # Run CPU/GPU bound inference in a background thread to prevent blocking event loop
        return await asyncio.to_thread(self._sync_transcribe, pcm_bytes, language)


def get_transcriber(backend: Optional[str] = None) -> BaseTranscriber:
    """Factory creating the active transcription provider based on configuration."""
    selected = (backend or settings.INFERENCE_BACKEND).lower()

    if selected == "groq":
        return GroqTranscriber(
            api_key=settings.GROQ_API_KEY,
            model=settings.GROQ_MODEL,
        )
    elif selected == "local":
        return LocalFasterWhisperTranscriber(
            model_size=settings.LOCAL_WHISPER_MODEL,
            device=settings.LOCAL_WHISPER_DEVICE,
            compute_type=settings.LOCAL_WHISPER_COMPUTE_TYPE,
        )
    else:
        raise ValueError(f"Unknown transcription backend '{selected}'. Expected 'groq' or 'local'.")
