"""Unit and integration tests for DSP spectral filtering, hallucination guard, and WER evals."""

import numpy as np

try:
    import pytest
except ImportError:
    pytest = None

from src.engine.dsp import (
    SpectralDenoisingFilter,
    calculate_snr_db,
    inject_mains_hum,
    inject_white_noise,
)
from src.engine.hallucination import HallucinationGuard
from evals.eval_wer import compute_cer, compute_wer, evaluate_corpus, normalize_text
from benchmarks.pareto_latency import run_latency_benchmark


def test_spectral_denoiser_pcm():
    """Verify spectral denoising processes 16kHz PCM frames and preserves buffer length."""
    denoiser = SpectralDenoisingFilter(sample_rate=16000)

    # 0.5s of audio = 8000 samples = 16000 bytes
    clean_audio = (np.sin(np.linspace(0, 100 * np.pi, 8000)) * 16000.0).astype(np.int16).tobytes()
    noisy_audio = inject_white_noise(clean_audio, target_snr_db=10.0)

    denoised_bytes = denoiser.denoise_pcm(noisy_audio)
    assert len(denoised_bytes) == len(noisy_audio)
    assert isinstance(denoised_bytes, bytes)


def test_synthetic_acoustic_noise_injection():
    """Verify white noise and mains hum injection math."""
    dummy_signal = (np.sin(np.linspace(0, 50 * np.pi, 4000)) * 20000.0).astype(np.int16).tobytes()

    white_noisy = inject_white_noise(dummy_signal, target_snr_db=15.0)
    assert len(white_noisy) == len(dummy_signal)

    hum_noisy = inject_mains_hum(dummy_signal, hum_freq=60.0, target_snr_db=10.0)
    assert len(hum_noisy) == len(dummy_signal)

    # Test SNR calculation
    s1 = np.ones(1000, dtype=np.float32)
    s2 = s1 + np.random.normal(0, 0.1, 1000).astype(np.float32)
    snr = calculate_snr_db(s1, s2)
    assert snr > 5.0


def test_hallucination_guard_phantom_tokens():
    """Verify hallucination guard traps typical Whisper failure modes."""
    guard = HallucinationGuard()

    # Phantom YouTube/Whisper artifacts
    assert guard.is_hallucination("thank you for watching!") is True
    assert guard.is_hallucination("Subtitles by...") is True
    assert guard.is_hallucination(".....") is True
    assert guard.is_hallucination("     ") is True

    # Degenerate repetitive loops
    cyclic = "thank you " * 10
    assert guard.is_hallucination(cyclic) is True

    # Normal spoken thoughts must NOT be flagged
    real_speech = "Let us schedule the team retrospective for Friday morning."
    assert guard.is_hallucination(real_speech) is False
    assert guard.filter_transcript(real_speech) == real_speech


def test_eval_wer_metrics():
    """Verify Levenshtein edit distance and WER/CER computations."""
    # 1. Exact match -> 0.0 WER
    res_exact = compute_wer("the quick brown fox", "the quick brown fox")
    assert res_exact["wer"] == 0.0
    assert res_exact["substitutions"] == 0

    # 2. Single substitution -> 1/4 = 0.25 WER
    res_sub = compute_wer("the quick brown fox", "the fast brown fox")
    assert res_sub["wer"] == 0.25
    assert res_sub["substitutions"] == 1

    # 3. Single deletion -> 1/4 = 0.25 WER
    res_del = compute_wer("the quick brown fox", "the brown fox")
    assert res_del["wer"] == 0.25
    assert res_del["deletions"] == 1

    # 4. Single insertion -> 1/3 = 0.3333 WER
    res_ins = compute_wer("the brown fox", "the quick brown fox")
    assert res_ins["wer"] == 0.3333
    assert res_ins["insertions"] == 1

    # 5. Character error rate
    c_res = compute_cer("hello", "helo")
    assert c_res["cer"] == 0.2
    assert c_res["deletions"] == 1

    # 6. Text normalization
    norm = normalize_text("  Hello, World! 123...  ")
    assert norm == "hello world 123"


def test_evaluate_corpus_aggregate():
    """Verify aggregated corpus evaluation reporting."""
    corpus = [
        ("the quick brown fox", "the fast brown fox"),
        ("speech to text streaming", "speech to text streaming"),
    ]
    report = evaluate_corpus(corpus)
    assert report["samples_evaluated"] == 2
    assert report["total_words"] == 8
    assert report["substitutions"] == 1
    assert report["aggregate_wer"] == 0.125
    assert report["accuracy_word_pct"] == 87.5


def test_pareto_latency_benchmark():
    """Verify acoustic pipeline benchmark profiling executes and calculates RTF."""
    results = run_latency_benchmark(durations=[0.25, 0.5])
    assert len(results) == 2
    for r in results:
        assert r.audio_duration_sec > 0
        assert r.total_pipeline_ms >= 0
        # Pipeline must be faster than real-time (RTF < 1.0)
        assert r.real_time_factor < 1.0
        assert r.speedup_multiplier > 1.0
