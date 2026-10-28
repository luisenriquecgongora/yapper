"""Wispr Flow text post-processor.

Strips filler words, resolves speech self-corrections, enforces proper punctuation,
and optionally extracts structured action JSON schemas using any LLM provider
(OpenAI, Groq, Together, vLLM, or deterministic regex rules).
"""

import json
import logging
import re
from typing import Any, Dict, Optional

from ..config import settings

logger = logging.getLogger(__name__)

SYSTEM_PROMPT_FLOW = (
    "You are an automated speech-to-text post-processor. "
    "Strip filler words ('um', 'uh', 'you know', 'like', 'er', 'ah'). "
    "Resolve conversational self-corrections ('actually make it 8 PM' replaces prior times). "
    "Punctuate cleanly. Preserve domain and technical jargon. "
    "Output ONLY the polished text with no conversational preamble, quotes, or explanations."
)

SYSTEM_PROMPT_ACTION = (
    "You are an intent extraction engine. Analyze the provided spoken transcript and extract "
    "the structured fields corresponding to the specified JSON schema. "
    "Output ONLY valid JSON adhering to the target schema with no Markdown formatting or preamble."
)

# Deterministic regex patterns for offline or fallback cleanup
FILLER_REGEX = re.compile(
    r"\b(um+|uh+|er+|ah+|you\s+know|i\s+mean|like,\s*|sort\s+of|kind\s+of)\b",
    flags=re.IGNORECASE,
)
MULTISPACE_REGEX = re.compile(r"\s+")
CORRECTION_REGEX = re.compile(r"(.*?)(?:,\s*|\s+)actually\s+(.*)", flags=re.IGNORECASE)


class FlowFormatter:
    """Post-processor that transforms raw transcribed utterances into crisp, coherent text."""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
    ) -> None:
        self._explicit_key = api_key
        self._explicit_base_url = base_url
        self._explicit_model = model
        self._client = None
        self._resolved_model = None

    def _resolve_client_config(self):
        """Determine API credentials and target model based on active backend."""
        if self._explicit_key is not None:
            return self._explicit_key, self._explicit_base_url, self._explicit_model or "gpt-4o-mini"

        backend = settings.effective_backend

        if backend == "groq" and settings.GROQ_API_KEY:
            return (
                settings.GROQ_API_KEY,
                "https://api.groq.com/openai/v1",
                settings.GROQ_LLM_MODEL or "llama-3.1-8b-instant",
            )
        elif backend == "openai" and settings.OPENAI_API_KEY:
            return (
                settings.OPENAI_API_KEY,
                None,
                settings.OPENAI_LLM_MODEL or "gpt-4o-mini",
            )
        elif backend in ("custom", "openai_compatible") and (settings.API_KEY or settings.API_BASE_URL):
            return (
                settings.API_KEY or settings.OPENAI_API_KEY or "not-needed",
                settings.API_BASE_URL,
                settings.LLM_MODEL or "llama-3.1-8b-instant",
            )
        return None, None, None

    def _get_client(self):
        if self._client is None:
            api_key, base_url, model = self._resolve_client_config()
            if api_key or base_url:
                from openai import AsyncOpenAI

                self._client = AsyncOpenAI(api_key=api_key or "none", base_url=base_url)
                self._resolved_model = model
        return self._client

    def _regex_fallback_cleanup(self, raw_text: str) -> str:
        """Lightweight deterministic cleanup when no LLM API is available."""
        if not raw_text:
            return ""

        text = raw_text.strip()

        # Handle simple self-corrections like: "Table four, actually table five" -> "table five"
        match = CORRECTION_REGEX.search(text)
        if match:
            text = match.group(2).strip()

        # Strip common filler tokens
        text = FILLER_REGEX.sub("", text)
        text = MULTISPACE_REGEX.sub(" ", text).strip()

        # Ensure sentence capitalization and terminal punctuation
        if text:
            text = text[0].upper() + text[1:]
            if not text.endswith((".", "!", "?")):
                text += "."

        return text

    async def format_transcript(self, raw_text: str) -> str:
        """Clean raw transcript by removing fillers, repairing self-corrections, and punctuating."""
        if not raw_text or not raw_text.strip():
            return ""

        clean_input = raw_text.strip()
        client = self._get_client()

        if client is None:
            return self._regex_fallback_cleanup(clean_input)

        try:
            chat_completion = await client.chat.completions.create(
                model=self._resolved_model or "gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT_FLOW},
                    {"role": "user", "content": clean_input},
                ],
                temperature=0.0,
                max_tokens=256,
            )
            result = chat_completion.choices[0].message.content or ""
            cleaned = result.strip().strip('"').strip("'")
            return cleaned or clean_input
        except Exception as exc:
            logger.warning("LLM Flow post-processing fallback engaged due to error: %s", exc)
            return self._regex_fallback_cleanup(clean_input)

    async def extract_action(self, raw_text: str, schema_json: Dict[str, Any]) -> Dict[str, Any]:
        """Extract structured JSON fields according to the provided target schema."""
        if not raw_text or not raw_text.strip():
            return {}

        client = self._get_client()
        if client is None:
            return {"raw": raw_text.strip()}

        prompt = (
            f"Transcript: \"{raw_text.strip()}\"\n\n"
            f"Target Schema:\n{json.dumps(schema_json, indent=2)}\n\n"
            "Return valid JSON output conforming to this schema."
        )

        try:
            chat_completion = await client.chat.completions.create(
                model=self._resolved_model or "gpt-4o-mini",
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT_ACTION},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.0,
                response_format={"type": "json_object"},
            )
            content = chat_completion.choices[0].message.content or "{}"
            return json.loads(content)
        except Exception as exc:
            logger.error("Structured action extraction failed: %s", exc)
            return {"error": str(exc), "raw": raw_text.strip()}
