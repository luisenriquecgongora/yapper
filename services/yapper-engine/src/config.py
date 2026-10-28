"""Configuration management for Yapper Engine using Pydantic Settings.

Supports multiple transcription providers: Local Faster-Whisper (zero-cloud default),
OpenAI, Groq, or any OpenAI-compatible API (Together, Fireworks, vLLM, Ollama).
"""

from typing import List, Literal, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Global service settings loaded from environment variables or .env file."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # Server binding
    PORT: int = Field(default=8000, description="Port to bind the HTTP and WebSocket server")
    HOST: str = Field(default="0.0.0.0", description="Host interface to bind")
    LOG_LEVEL: str = Field(default="INFO", description="Logging level")

    # Speech-to-Text inference provider
    # Options: "auto" (detect from keys), "local" (Faster-Whisper), "openai", "groq", "custom"
    INFERENCE_BACKEND: Literal["auto", "local", "openai", "groq", "custom"] = Field(
        default="auto",
        description="Active STT provider: 'local' (zero cloud/free), 'openai', 'groq', 'custom', or 'auto'",
    )

    # Generic / Custom OpenAI-compatible endpoint (vLLM, LocalAI, Together AI, Fireworks)
    API_BASE_URL: Optional[str] = Field(
        default=None,
        description="Custom base URL for any OpenAI-compatible audio API (e.g., http://localhost:8080/v1)",
    )
    API_KEY: Optional[str] = Field(
        default=None,
        description="API key for custom or third-party endpoint",
    )
    STT_MODEL: Optional[str] = Field(
        default=None,
        description="Override STT model identifier for the active backend",
    )
    LLM_MODEL: Optional[str] = Field(
        default=None,
        description="Override LLM model identifier for Wispr Flow text cleanup",
    )

    # OpenAI provider configuration
    OPENAI_API_KEY: str = Field(
        default="",
        description="OpenAI API key for whisper-1 and gpt-4o-mini",
    )
    OPENAI_MODEL: str = Field(
        default="whisper-1",
        description="OpenAI speech-to-text model ID",
    )
    OPENAI_LLM_MODEL: str = Field(
        default="gpt-4o-mini",
        description="OpenAI model for Flow text cleanup",
    )

    # Groq provider configuration
    GROQ_API_KEY: str = Field(
        default="",
        description="Groq API key for cloud Whisper and Llama inference",
    )
    GROQ_MODEL: str = Field(
        default="whisper-large-v3",
        description="Model identifier for Groq Whisper inference",
    )
    GROQ_LLM_MODEL: str = Field(
        default="llama-3.1-8b-instant",
        description="Model identifier for Groq Flow cleanup post-processor",
    )

    # Local Faster-Whisper configuration (Zero-cloud fallback)
    LOCAL_WHISPER_MODEL: str = Field(
        default="tiny.en",
        description="Faster-Whisper model size for local CTranslate2 inference",
    )
    LOCAL_WHISPER_DEVICE: str = Field(
        default="cpu",
        description="Execution device for Faster-Whisper ('cpu' or 'cuda')",
    )
    LOCAL_WHISPER_COMPUTE_TYPE: str = Field(
        default="int8",
        description="Compute precision for Faster-Whisper ('int8', 'float16', 'float32')",
    )

    # Audio & Voice Activity Detection
    SAMPLE_RATE: int = Field(default=16000, description="Target audio sample rate in Hz")
    VAD_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0, description="Speech probability threshold for Silero VAD")
    VAD_SILENCE_DURATION_MS: int = Field(
        default=400,
        ge=50,
        le=2000,
        description="Continuous silence duration in ms that triggers transcription flush",
    )
    MAX_BUFFER_SECONDS: float = Field(
        default=30.0,
        ge=1.0,
        le=60.0,
        description="Maximum audio duration before forcing a transcription split",
    )
    SILERO_MODEL_PATH: str = Field(
        default="",
        description="Optional local filesystem path to silero_vad.onnx model",
    )

    # Security & CORS
    CORS_ORIGINS: List[str] = Field(
        default=["*"],
        description="List of allowed CORS origins for WebSocket and HTTP clients",
    )

    @property
    def effective_backend(self) -> str:
        """Resolve the active backend taking environment variables and available credentials into account."""
        backend = (self.INFERENCE_BACKEND or "auto").lower()

        if backend != "auto":
            return backend

        # Automatic detection based on available credentials
        if self.GROQ_API_KEY:
            return "groq"
        if self.OPENAI_API_KEY:
            return "openai"
        if self.API_BASE_URL:
            return "custom"

        # Default to 100% free local inference if no API keys are supplied
        return "local"


settings = Settings()
