"""Information-theoretic hallucination and repetition detection engine for speech decoders."""

import collections
import math
import re
import zlib
from typing import Optional

# Standard phantom Whisper tokens produced during background noise or silence
PHANTOM_PATTERNS = [
    re.compile(r"^(\[.*\]|\(.*\)|thank you for watching.*|subtitles by.*|subscribe to.*|you|\.+)$", re.IGNORECASE),
    re.compile(r"^[\s\.\,\-\_\!\?\:\;]+$"),
    re.compile(r"(thank you|please subscribe|see you in the next video){3,}", re.IGNORECASE),
    re.compile(r"(.)\1{7,}"),  # 8+ consecutive identical characters (e.g. "aaaaaaa")
]


class HallucinationGuard:
    """Detects and suppresses degenerative autoregressive loops and phantom Whisper tokens.

    Uses a combination of pattern matching, Shannon entropy, and Kolmogorov compression ratios.
    """

    def __init__(
        self,
        min_compression_ratio: float = 0.35,
        min_entropy: float = 1.8,
        min_logprob_threshold: float = -1.2,
    ) -> None:
        self.min_compression_ratio = min_compression_ratio
        self.min_entropy = min_entropy
        self.min_logprob_threshold = min_logprob_threshold

    @staticmethod
    def compute_shannon_entropy(text: str) -> float:
        """Calculate the Shannon entropy of the character distribution in bits per character.

        H(X) = -sum(p(x) * log2(p(x)))
        """
        if not text:
            return 0.0

        length = len(text)
        counts = collections.Counter(text.lower())
        entropy = 0.0

        for count in counts.values():
            p = count / length
            entropy -= p * math.log2(p)

        return entropy

    @staticmethod
    def compute_compression_ratio(text: str) -> float:
        """Calculate sequence compressibility via zlib as an approximation of Kolmogorov complexity.

        Degenerate repetitive loops (e.g. 'bye bye bye bye bye') compress down to tiny byte sizes.
        """
        raw_bytes = text.encode("utf-8")
        if len(raw_bytes) < 20:
            return 1.0  # Too short to measure compressibility accurately

        compressed = zlib.compress(raw_bytes, level=9)
        return len(compressed) / len(raw_bytes)

    @staticmethod
    def has_ngram_repetition(text: str, n: int = 3, min_repeats: int = 3) -> bool:
        """Detect cyclic n-gram repetition in the word sequence."""
        words = text.lower().split()
        if len(words) < n * min_repeats:
            return False

        ngrams = [tuple(words[i : i + n]) for i in range(len(words) - n + 1)]
        counts = collections.Counter(ngrams)

        for ngram, count in counts.items():
            if count >= min_repeats:
                return True
        return False

    def is_hallucination(
        self,
        text: str,
        avg_logprob: Optional[float] = None,
        no_speech_prob: Optional[float] = None,
    ) -> bool:
        """Determine if an utterance is an autoregressive hallucination."""
        if not text or not text.strip():
            return True

        clean = text.strip()

        # 1. Regex phantom checks
        for pattern in PHANTOM_PATTERNS:
            if pattern.search(clean):
                return True

        # 2. Probability checks (if provided by Whisper decoder)
        if avg_logprob is not None and avg_logprob < self.min_logprob_threshold:
            if no_speech_prob is not None and no_speech_prob > 0.4:
                return True

        # 3. Cyclic n-gram repetition
        if self.has_ngram_repetition(clean, n=2, min_repeats=4) or self.has_ngram_repetition(clean, n=3, min_repeats=3):
            return True

        # 4. Compression ratio check on longer texts (>40 chars)
        if len(clean) >= 40:
            ratio = self.compute_compression_ratio(clean)
            if ratio < self.min_compression_ratio:
                return True

        # 5. Shannon entropy check (repetitive strings have low entropy)
        if len(clean) >= 25:
            entropy = self.compute_shannon_entropy(clean)
            if entropy < self.min_entropy:
                return True

        return False

    def filter_transcript(
        self,
        text: str,
        avg_logprob: Optional[float] = None,
        no_speech_prob: Optional[float] = None,
    ) -> str:
        """Return the cleaned transcript if valid, or an empty string if hallucinated."""
        if self.is_hallucination(text, avg_logprob, no_speech_prob):
            return ""
        return text.strip()
