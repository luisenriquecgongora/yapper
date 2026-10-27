"""Integration and unit tests for Yapper Engine HTTP and WebSocket endpoints."""

import json
import math
import struct
from unittest.mock import AsyncMock, patch
import pytest
from fastapi.testclient import TestClient

from src.config import settings
from src.engine.formatter import FlowFormatter
from src.engine.vad import SileroVAD


def generate_synthetic_pcm(duration_sec: float = 0.5, sample_rate: int = 16000, freq_hz: float = 440.0) -> bytes:
    """Generate 16kHz 16-bit mono PCM sine wave audio bytes."""
    num_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(num_samples):
        if freq_hz > 0:
            val = int(32767.0 * 0.5 * math.sin(2.0 * math.pi * freq_hz * i / sample_rate))
        else:
            val = 0
        samples.append(val)
    return struct.pack(f"<{len(samples)}h", *samples)


def test_health_endpoint(client: TestClient):
    """Verify health endpoint returns valid status and memory stats."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "uptime_seconds" in data
    assert data["sample_rate"] == 16000
    assert "memory_rss_mb" in data


def test_config_settings():
    """Verify configuration loads expected defaults."""
    assert settings.SAMPLE_RATE == 16000
    assert settings.PORT == 8000
    assert settings.VAD_THRESHOLD >= 0.0


def test_vad_processing():
    """Verify VAD correctly distinguishes silence from signal."""
    vad = SileroVAD(sample_rate=16000, threshold=0.5)

    # 1. Pure silence
    silence = generate_synthetic_pcm(duration_sec=0.2, freq_hz=0)
    silence_prob = vad.process_chunk(silence)
    assert silence_prob < 0.3

    # 2. Strong tone signal
    tone = generate_synthetic_pcm(duration_sec=0.2, freq_hz=440.0)
    tone_prob = vad.process_chunk(tone)
    assert tone_prob > silence_prob

    # 3. State reset
    vad.reset_state()


@pytest.mark.asyncio
async def test_formatter_flow_regex_cleanup():
    """Verify Flow post-processor cleans fillers and self-corrections."""
    formatter = FlowFormatter(api_key=None)

    raw = "uh book table four actually table five please"
    cleaned = await formatter.format_transcript(raw)
    assert "actually" not in cleaned.lower() or "table five" in cleaned.lower()
    assert "uh" not in cleaned.lower()
    assert cleaned.endswith(".")

    # Test sentence capitalization
    single = "hello world"
    cleaned_single = await formatter.format_transcript(single)
    assert cleaned_single.startswith("Hello")


def test_websocket_handshake_and_control(client: TestClient):
    """Verify WebSocket handshake and JSON control message protocol."""
    with client.websocket_connect("/ws/audio?language=en&mode=flow") as ws:
        # Send CONFIG update
        ws.send_text(json.dumps({"type": "CONFIG", "language": "es", "mode": "raw"}))
        ack = json.loads(ws.receive_text())
        assert ack["type"] == "CONFIG_ACK"
        assert ack["language"] == "es"
        assert ack["mode"] == "raw"

        # Send RESET
        ws.send_text(json.dumps({"type": "RESET"}))
        reset_ack = json.loads(ws.receive_text())
        assert reset_ack["type"] == "RESET_ACK"


def test_websocket_audio_streaming_and_flush(client: TestClient):
    """Verify binary PCM frame ingestion and explicit FLUSH dispatch."""
    mock_transcribe = AsyncMock(return_value="reservation confirmed for seven")

    with patch("src.api.websocket.get_transcriber") as mock_get_transcriber:
        mock_instance = AsyncMock()
        mock_instance.transcribe = mock_transcribe
        mock_get_transcriber.return_value = mock_instance

        with client.websocket_connect("/ws/audio?language=en&mode=flow") as ws:
            # Stream 0.3s of audio chunks
            chunk = generate_synthetic_pcm(duration_sec=0.1, freq_hz=300.0)
            ws.send_bytes(chunk)
            ws.send_bytes(chunk)
            ws.send_bytes(chunk)

            # Trigger manual FLUSH
            ws.send_text(json.dumps({"type": "FLUSH"}))

            # Receive transcription RESULT
            response_raw = ws.receive_text()
            response = json.loads(response_raw)
            assert response["type"] == "RESULT"
            assert "raw" in response
            assert "text" in response
            assert "duration_ms" in response
            assert response["raw"] == "reservation confirmed for seven"
