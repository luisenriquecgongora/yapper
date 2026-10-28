"""Real-time duplex WebSocket route for 16kHz PCM audio streaming.

Performs Silero VAD gating, speech segment accumulation, transcription inference,
and Wispr Flow post-processing without disk storage.
"""

import json
import logging
import time
from typing import Any, Dict, Optional
from fastapi import APIRouter, Query, WebSocket, WebSocketDisconnect

from ..config import settings
from ..engine.dsp import SpectralDenoisingFilter
from ..engine.formatter import FlowFormatter
from ..engine.hallucination import HallucinationGuard
from ..engine.transcription import BaseTranscriber, get_transcriber
from ..engine.vad import SileroVAD

logger = logging.getLogger(__name__)

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/audio")
async def audio_websocket_endpoint(
    websocket: WebSocket,
    language: str = Query(default="en"),
    mode: str = Query(default="flow"),  # "flow", "raw", "action"
    denoise: bool = Query(default=True),
) -> None:
    """Duplex streaming WebSocket endpoint.

    Ingests 16kHz 16-bit PCM binary frames, applies Silero VAD gating,
    optional spectral noise suppression, and returns formatted transcripts upon voice completion.
    """
    await websocket.accept()
    logger.info("WebSocket connection established (language=%s, mode=%s, denoise=%s)", language, mode, denoise)

    # Instantiate isolated per-connection session resources
    vad = SileroVAD(
        model_path=settings.SILERO_MODEL_PATH or None,
        sample_rate=settings.SAMPLE_RATE,
        threshold=settings.VAD_THRESHOLD,
    )
    denoiser = SpectralDenoisingFilter(sample_rate=settings.SAMPLE_RATE) if denoise else None
    guard = HallucinationGuard()
    transcriber: BaseTranscriber = get_transcriber()
    formatter = FlowFormatter()

    session_lang = language
    session_mode = mode
    action_schema: Optional[Dict[str, Any]] = None

    # Audio accumulation state
    audio_buffer = bytearray()
    has_speech_started = False
    silence_start_time: Optional[float] = None
    bytes_per_second = settings.SAMPLE_RATE * 2  # 16,000 samples * 2 bytes/sample = 32,000 bytes/sec
    max_buffer_bytes = int(settings.MAX_BUFFER_SECONDS * bytes_per_second)
    silence_threshold_sec = settings.VAD_SILENCE_DURATION_MS / 1000.0

    async def flush_and_transcribe(reason: str = "silence") -> None:
        nonlocal audio_buffer, has_speech_started, silence_start_time

        if len(audio_buffer) < 3200:  # < 0.1s
            audio_buffer.clear()
            has_speech_started = False
            silence_start_time = None
            vad.reset_state()
            return

        pcm_to_process = bytes(audio_buffer)
        audio_buffer.clear()
        has_speech_started = False
        silence_start_time = None
        vad.reset_state()

        t0 = time.perf_counter()
        try:
            logger.debug("Transcribing utterance (%d bytes, reason: %s)...", len(pcm_to_process), reason)
            # Apply pre-transcription spectral denoising if enabled
            audio_for_asr = denoiser.denoise_pcm(pcm_to_process) if denoiser else pcm_to_process
            raw_asr = await transcriber.transcribe(audio_for_asr, language=session_lang)

            # Filter autoregressive hallucinations and repetitive degenerate tokens
            raw_text = guard.filter_transcript(raw_asr)

            formatted_text = raw_text
            extracted_action: Optional[Dict[str, Any]] = None

            if raw_text:
                if session_mode == "flow":
                    formatted_text = await formatter.format_transcript(raw_text)
                elif session_mode == "action" and action_schema:
                    extracted_action = await formatter.extract_action(raw_text, action_schema)
                    formatted_text = await formatter.format_transcript(raw_text)

            elapsed_ms = int((time.perf_counter() - t0) * 1000)

            response_payload = {
                "type": "RESULT",
                "raw": raw_text,
                "text": formatted_text,
                "action": extracted_action,
                "duration_ms": elapsed_ms,
            }
            await websocket.send_text(json.dumps(response_payload))
        except Exception as exc:
            logger.error("Error during utterance processing: %s", exc)
            await websocket.send_text(
                json.dumps(
                    {
                        "type": "ERROR",
                        "message": str(exc),
                    }
                )
            )

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                chunk: bytes = message["bytes"]
                audio_buffer.extend(chunk)

                # Evaluate VAD on the received chunk
                is_speech = vad.is_speech(chunk)
                now = time.perf_counter()

                if is_speech:
                    has_speech_started = True
                    silence_start_time = None
                else:
                    if has_speech_started:
                        if silence_start_time is None:
                            silence_start_time = now
                        elif (now - silence_start_time) >= silence_threshold_sec:
                            # Silence window satisfied after speech -> flush segment
                            await flush_and_transcribe(reason="vad_silence")

                # Safeguard: Force flush if buffer hits max duration
                if len(audio_buffer) >= max_buffer_bytes:
                    await flush_and_transcribe(reason="max_buffer")

            elif "text" in message and message["text"]:
                try:
                    payload = json.loads(message["text"])
                    msg_type = payload.get("type", "").upper()

                    if msg_type == "CONFIG":
                        if "language" in payload:
                            session_lang = payload["language"]
                        if "mode" in payload:
                            session_mode = payload["mode"]
                        if "schema" in payload:
                            action_schema = payload["schema"]
                        await websocket.send_text(
                            json.dumps({"type": "CONFIG_ACK", "language": session_lang, "mode": session_mode})
                        )

                    elif msg_type == "FLUSH":
                        # Client requested explicit finalization
                        await flush_and_transcribe(reason="client_flush")

                    elif msg_type == "RESET":
                        audio_buffer.clear()
                        has_speech_started = False
                        silence_start_time = None
                        vad.reset_state()
                        await websocket.send_text(json.dumps({"type": "RESET_ACK"}))

                except json.JSONDecodeError:
                    logger.warning("Received invalid non-JSON text frame: %s", message["text"])

    except WebSocketDisconnect:
        logger.info("Client disconnected from WebSocket cleanly")
    except Exception as exc:
        logger.warning("WebSocket session error or abort: %s", exc)
    finally:
        audio_buffer.clear()
        vad.reset_state()
