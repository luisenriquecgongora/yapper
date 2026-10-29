"""Universal transcription providers supporting Local Faster-Whisper, OpenAI, Groq, and custom endpoints."""

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


class OpenAICompatibleTranscriber(BaseTranscriber):
    """Universal cloud transcriber adhering to the OpenAI audio transcription REST specification.

    Compatible with OpenAI (whisper-1), Groq (whisper-large-v3), Together AI,
    Fireworks AI, Cloudflare Workers, and self-hosted vLLM/LocalAI servers.
    """

    def __init__(
        self,
        api_key: str,
        base_url: Optional[str] = None,
        model: str = "whisper-1",
    ) -> None:
        self.api_key = api_key
        self.base_url = base_url
        self.model = model
        self._client = None

    def _get_client(self):
        if self._client is None:
            if not self.api_key and not self.base_url:
                raise ValueError("API key or base_url is required for OpenAI-compatible transcription.")

            from openai import AsyncOpenAI

            self._client = AsyncOpenAI(
                api_key=self.api_key or "not-needed",
                base_url=self.base_url,
            )
        return self._client

    async def transcribe(self, pcm_bytes: bytes, language: str = "en") -> str:
        if not pcm_bytes or len(pcm_bytes) < 3200:  # < 0.1s
            return ""

        client = self._get_client()
        wav_bytes = pcm_to_wav_bytes(pcm_bytes, sample_rate=settings.SAMPLE_RATE)

        try:
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
            provider_label = self.base_url or "OpenAI"
            logger.error("Cloud transcription failed via %s: %s", provider_label, exc)
            raise


class GroqTranscriber(OpenAICompatibleTranscriber):
    """High-throughput Groq Whisper transcriber running on LPU inference hardware."""

    def __init__(self, api_key: Optional[str] = None, model: Optional[str] = None) -> None:
        key = api_key or settings.GROQ_API_KEY
        m = model or settings.GROQ_MODEL or "whisper-large-v3"
        super().__init__(api_key=key, base_url="https://api.groq.com/openai/v1", model=m)


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
            from .model_loader import ensure_model_ready
            model_path_or_name = ensure_model_ready(self.model_size)

            from faster_whisper import WhisperModel

            self._model = WhisperModel(
                model_path_or_name,
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

        return await asyncio.to_thread(self._sync_transcribe, pcm_bytes, language)


_TRANSCRIBER_CACHE: dict = {}


def get_transcriber(backend: Optional[str] = None, model_size: Optional[str] = None) -> BaseTranscriber:
    """Factory creating or returning the cached transcription provider."""
    selected = (backend or settings.effective_backend).lower()
    cache_key = f"{selected}:{model_size or 'default'}"

    if cache_key in _TRANSCRIBER_CACHE:
        return _TRANSCRIBER_CACHE[cache_key]

    effective_model = model_size or settings.LOCAL_WHISPER_MODEL

    if selected == "local":
        instance = LocalFasterWhisperTranscriber(
            model_size=effective_model,
            device=settings.LOCAL_WHISPER_DEVICE,
            compute_type=settings.LOCAL_WHISPER_COMPUTE_TYPE,
        )
    elif selected == "groq":
        instance = GroqTranscriber(
            api_key=settings.GROQ_API_KEY,
            model=model_size or settings.GROQ_MODEL,
        )
    elif selected == "openai":
        instance = OpenAICompatibleTranscriber(
            api_key=settings.OPENAI_API_KEY,
            base_url=None,  # Standard api.openai.com
            model=model_size or settings.OPENAI_MODEL,
        )
    elif selected in ("custom", "openai_compatible"):
        instance = OpenAICompatibleTranscriber(
            api_key=settings.API_KEY or settings.OPENAI_API_KEY or "none",
            base_url=settings.API_BASE_URL,
            model=model_size or settings.STT_MODEL or "whisper-1",
        )
    else:
        logger.warning("Unrecognized backend '%s'. Defaulting to local Faster-Whisper.", selected)
        instance = LocalFasterWhisperTranscriber(
            model_size=effective_model,
            device=settings.LOCAL_WHISPER_DEVICE,
            compute_type=settings.LOCAL_WHISPER_COMPUTE_TYPE,
        )

    _TRANSCRIBER_CACHE[cache_key] = instance
    return instance
