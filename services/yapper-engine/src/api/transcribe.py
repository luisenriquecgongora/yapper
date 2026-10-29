"""HTTP audio transcription endpoint supporting both raw binary streams and multipart uploads."""

import io
import logging
import time
import wave
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException, Query, Request

from ..config import settings
from ..engine.dsp import SpectralDenoisingFilter
from ..engine.formatter import FlowFormatter
from ..engine.hallucination import HallucinationGuard
from ..engine.transcription import BaseTranscriber, get_transcriber

logger = logging.getLogger(__name__)

router = APIRouter(tags=["transcribe"])


def extract_pcm_from_wav(wav_bytes: bytes) -> bytes:
    """Extract raw 16kHz 16-bit mono PCM frames from WAV container."""
    try:
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            # Read all frames directly
            return wf.readframes(wf.getnframes())
    except Exception:
        # If not a standard WAV or already raw PCM, return bytes as-is
        return wav_bytes


@router.post("/api/transcribe")
async def transcribe_audio_endpoint(
    request: Request,
    language: str = Query(default="en"),
    mode: str = Query(default="flow"),
    denoise: bool = Query(default=True),
    model: Optional[str] = Query(default=None),
) -> Dict[str, Any]:
    """Transcribe an audio payload (WAV or 16-bit PCM) into clean text with Wispr Flow post-processing.

    Accepts:
    - Raw binary audio body with Content-Type: audio/wav or application/octet-stream
    - Multipart form-data with 'file' field
    """
    t0 = time.perf_counter()
    content_type = request.headers.get("content-type", "")

    # 1. Parse audio payload
    if "multipart/form-data" in content_type:
        form = await request.form()
        uploaded_file = form.get("file")
        if not uploaded_file or not hasattr(uploaded_file, "read"):
            raise HTTPException(status_code=400, detail="Missing 'file' field in multipart form data.")
        raw_audio_bytes = await uploaded_file.read()
        if not model and "model" in form:
            model = str(form.get("model"))
        if language == "en" and "language" in form:
            language = str(form.get("language"))
    else:
        raw_audio_bytes = await request.body()

    if not raw_audio_bytes or len(raw_audio_bytes) < 64:
        raise HTTPException(status_code=400, detail="Empty or invalid audio payload.")

    # 2. Extract PCM from WAV header if present
    pcm_bytes = extract_pcm_from_wav(raw_audio_bytes)

    # 3. Apply DSP spectral denoising if requested
    if denoise and len(pcm_bytes) >= 1024:
        denoiser = SpectralDenoisingFilter(sample_rate=settings.SAMPLE_RATE)
        pcm_bytes = denoiser.denoise_pcm(pcm_bytes)

    # 4. Transcribe using active backend (Local Faster-Whisper, OpenAI, or Groq)
    transcriber: BaseTranscriber = get_transcriber(model_size=model)
    try:
        raw_asr = await transcriber.transcribe(pcm_bytes, language=language)
    except Exception as exc:
        logger.error("Transcription execution error: %s", exc)
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(exc)}")

    # 5. Filter autoregressive hallucinations
    guard = HallucinationGuard()
    raw_text = guard.filter_transcript(raw_asr)

    # 6. Apply Wispr Flow text cleanup (strip fillers, repair self-corrections)
    formatted_text = raw_text
    if raw_text and mode == "flow":
        formatter = FlowFormatter()
        formatted_text = await formatter.format_transcript(raw_text)

    elapsed_ms = int((time.perf_counter() - t0) * 1000)

    return {
        "text": formatted_text,
        "raw": raw_text,
        "duration_ms": elapsed_ms,
        "backend": settings.effective_backend,
    }
