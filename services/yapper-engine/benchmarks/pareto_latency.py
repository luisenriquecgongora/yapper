"""Acoustic latency, Real-Time Factor (RTF), and Pareto frontier benchmark suite."""

import asyncio
import math
from pathlib import Path
import struct
import sys
import time
from dataclasses import dataclass
from typing import List, Optional

# Ensure services/yapper-engine root is in sys.path
engine_root = Path(__file__).resolve().parent.parent
if str(engine_root) not in sys.path:
    sys.path.insert(0, str(engine_root))

from src.engine.dsp import SpectralDenoisingFilter
from src.engine.vad import SileroVAD


@dataclass
class BenchmarkResult:
    audio_duration_sec: float
    dsp_latency_ms: float
    vad_latency_ms: float
    total_pipeline_ms: float
    real_time_factor: float
    speedup_multiplier: float


def generate_benchmark_pcm(duration_sec: float = 1.0, sample_rate: int = 16000) -> bytes:
    """Generate deterministic synthetic 16kHz audio with speech-like harmonic energy."""
    num_samples = int(duration_sec * sample_rate)
    samples = []
    for i in range(num_samples):
        # Multi-harmonic complex tone simulating vocal formant frequencies (150Hz, 300Hz, 600Hz)
        t = i / sample_rate
        val = int(
            32767.0
            * (
                0.4 * math.sin(2.0 * math.pi * 150.0 * t)
                + 0.3 * math.sin(2.0 * math.pi * 300.0 * t)
                + 0.2 * math.sin(2.0 * math.pi * 600.0 * t)
            )
        )
        samples.append(max(-32768, min(32767, val)))
    return struct.pack(f"<{len(samples)}h", *samples)


def run_latency_benchmark(
    durations: Optional[List[float]] = None,
    sample_rate: int = 16000,
) -> List[BenchmarkResult]:
    """Execute acoustic pipeline latency profiling across diverse utterance durations."""
    if durations is None:
        durations = [0.5, 1.0, 2.5, 5.0, 10.0]

    denoiser = SpectralDenoisingFilter(sample_rate=sample_rate)
    vad = SileroVAD(sample_rate=sample_rate)

    results: List[BenchmarkResult] = []

    for dur in durations:
        pcm = generate_benchmark_pcm(duration_sec=dur, sample_rate=sample_rate)

        # 1. Profile DSP spectral subtraction
        t_dsp_start = time.perf_counter()
        cleaned_pcm = denoiser.denoise_pcm(pcm)
        dsp_ms = (time.perf_counter() - t_dsp_start) * 1000.0

        # 2. Profile Silero VAD gating
        t_vad_start = time.perf_counter()
        _prob = vad.process_chunk(cleaned_pcm)
        vad_ms = (time.perf_counter() - t_vad_start) * 1000.0

        total_ms = dsp_ms + vad_ms
        total_sec = total_ms / 1000.0

        # Real-Time Factor (RTF) = processing_time / audio_time
        rtf = total_sec / dur if dur > 0 else 0.0
        speedup = dur / total_sec if total_sec > 0 else 0.0

        results.append(
            BenchmarkResult(
                audio_duration_sec=dur,
                dsp_latency_ms=round(dsp_ms, 2),
                vad_latency_ms=round(vad_ms, 2),
                total_pipeline_ms=round(total_ms, 2),
                real_time_factor=round(rtf, 4),
                speedup_multiplier=round(speedup, 1),
            )
        )

    return results


def print_benchmark_table(results: List[BenchmarkResult]) -> None:
    """Format benchmark results into an academic Markdown table."""
    print("\n### ⚡ Acoustic Pipeline Latency & RTF Benchmark")
    print("| Audio Duration (s) | DSP Denoise (ms) | VAD Gating (ms) | Total Prep (ms) | Real-Time Factor (RTF) | Speedup Factor |")
    print("| :---: | :---: | :---: | :---: | :---: | :---: |")
    for r in results:
        print(
            f"| {r.audio_duration_sec:4.1f}s | {r.dsp_latency_ms:6.2f}ms | {r.vad_latency_ms:6.2f}ms | {r.total_pipeline_ms:6.2f}ms | **{r.real_time_factor:.4f}** | **{r.speedup_multiplier:.1f}x real-time** |"
        )
    print()


if __name__ == "__main__":
    benchmark_runs = run_latency_benchmark()
    print_benchmark_table(benchmark_runs)
