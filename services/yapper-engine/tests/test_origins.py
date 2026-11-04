"""Only localhost pages and configured origins may call the engine from a browser."""

import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from src.api.origins import origin_allowed
from src.config import settings


@pytest.mark.parametrize(
    "origin",
    [None, "http://localhost:5173", "http://127.0.0.1:3000", "https://localhost", "http://[::1]:8080"],
)
def test_local_and_non_browser_origins_allowed(origin):
    assert origin_allowed(origin)


@pytest.mark.parametrize(
    "origin", ["https://evil.example", "http://localhost.evil.example", "http://127.0.0.1.evil.example", "null"]
)
def test_other_sites_rejected(origin):
    assert not origin_allowed(origin)


def test_configured_origin_and_wildcard_allowed(monkeypatch):
    monkeypatch.setattr(settings, "CORS_ORIGINS", ["https://app.example.com"])
    assert origin_allowed("https://app.example.com")
    assert not origin_allowed("https://other.example.com")
    monkeypatch.setattr(settings, "CORS_ORIGINS", ["*"])
    assert origin_allowed("https://other.example.com")


def test_cors_headers_only_for_allowed_origins(client: TestClient):
    ok = client.get("/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers.get("access-control-allow-origin") == "http://localhost:5173"
    assert "access-control-allow-credentials" not in ok.headers
    bad = client.get("/health", headers={"Origin": "https://evil.example"})
    assert "access-control-allow-origin" not in bad.headers


def test_websocket_rejects_other_sites(client: TestClient):
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/ws/audio", headers={"Origin": "https://evil.example"}) as ws:
            ws.receive_text()
    assert exc.value.code == 1008


def test_websocket_accepts_localhost_page(client: TestClient):
    with client.websocket_connect("/ws/audio", headers={"Origin": "http://localhost:5173"}) as ws:
        ws.close()
