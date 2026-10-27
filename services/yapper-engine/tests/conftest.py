"""Pytest fixtures and environment configuration."""

import os
import pytest
from fastapi.testclient import TestClient

# Set test environment flags
os.environ["INFERENCE_BACKEND"] = "local"
os.environ["VAD_THRESHOLD"] = "0.4"
os.environ["VAD_SILENCE_DURATION_MS"] = "200"

from src.main import app


@pytest.fixture
def client():
    """Create a FastAPI TestClient instance."""
    with TestClient(app) as test_client:
        yield test_client
