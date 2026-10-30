"""Transcription client routing audio to either Yapper Engine HTTP server or local faster-whisper."""

import asyncio
import logging
import os
import sys
from typing import Optional

from .config import ENGINE_HTTP_URL, FALLBACK_HTTP_URL

logger = logging.getLogger("yapper.hud.transcriber")


class TranscriptionClient:
    """Manages audio transcription dispatching across HTTP and local in-process engines."""

    def __init__(self, engine_url: str = ENGINE_HTTP_URL) -> None:
        self.engine_url = engine_url

    def check_health(self) -> bool:
        """Check if external Yapper Engine HTTP backend is live."""
        import requests
        for base in [self.engine_url, FALLBACK_HTTP_URL]:
            try:
                res = requests.get(f"{base}/health", timeout=1.2)
                if res.status_code == 200:
                    return True
            except Exception:
                pass
        return False

    def transcribe(
        self,
        wav_bytes: bytes,
        pcm_bytes: bytes,
        language: str = "en",
        model: str = "tiny.en",
    ) -> str:
        """Route transcription to HTTP engine if available, or fall back to in-process model."""
        # 1. First priority: HTTP API
        http_result = self._transcribe_via_http(wav_bytes, language, model)
        if http_result is not None:
            return http_result

        # 2. Second priority: In-process faster-whisper engine
        return self._transcribe_via_local_engine(pcm_bytes, language, model)

    def _transcribe_via_http(self, wav_bytes: bytes, language: str, model: str) -> Optional[str]:
        import requests
        for endpoint in [f"{self.engine_url}/api/transcribe", f"{FALLBACK_HTTP_URL}/api/transcribe"]:
            try:
                res = requests.post(
                    endpoint,
                    params={"language": language, "model": model},
                    files={"file": ("speech.wav", wav_bytes, "audio/wav")},
                    data={"language": language, "model": model},
                    timeout=10,
                )
                if res.status_code == 200:
                    text = res.json().get("text", "")
                    if text:
                        return text
            except Exception:
                pass
        return None

    def _transcribe_via_local_engine(self, pcm_bytes: bytes, language: str, model_id: str) -> str:
        try:
            engine_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "services", "yapper-engine"))
            if engine_path not in sys.path:
                sys.path.insert(0, engine_path)

            from src.engine.transcription import get_transcriber
            from src.engine.formatter import FlowFormatter

            async def run_direct():
                transcriber = get_transcriber(model_size=model_id)
                raw = await transcriber.transcribe(pcm_bytes, language=language)
                formatter = FlowFormatter()
                return await formatter.format_transcript(raw)

            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            text = loop.run_until_complete(run_direct())
            loop.close()
            return text or ""
        except Exception as exc:
            logger.warning("Local faster-whisper fallback transcription error: %s", exc)
            return ""
