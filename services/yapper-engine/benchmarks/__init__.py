"""Performance, RTF, and latency benchmarking suite for Yapper Engine."""

from .pareto_latency import run_latency_benchmark, BenchmarkResult

__all__ = ["run_latency_benchmark", "BenchmarkResult"]
