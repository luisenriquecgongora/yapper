"""Quantitative Word Error Rate (WER) and Character Error Rate (CER) evaluation suite.

Calculates exact Levenshtein alignment matrices, error breakdowns (Substitutions,
Deletions, Insertions), and dataset-level aggregated acoustic metrics.
"""

import re
import sys
from typing import Any, Dict, List, Tuple


def normalize_text(text: str) -> str:
    """Normalize text according to standard Speech-to-Text evaluation criteria."""
    if not text:
        return ""
    # Lowercase
    normalized = text.lower()
    # Remove punctuation characters
    normalized = re.sub(r"[^\w\s]", "", normalized)
    # Collapse multiple whitespaces
    normalized = re.sub(r"\s+", " ", normalized).strip()
    return normalized


def compute_levenshtein_matrix(ref_tokens: List[str], hyp_tokens: List[str]) -> Tuple[int, int, int]:
    """Compute dynamic programming matrix and return (substitutions, deletions, insertions)."""
    r_len = len(ref_tokens)
    h_len = len(hyp_tokens)

    # DP table: dp[i][j] holds (cost, S, D, I)
    dp = [[(0, 0, 0, 0) for _ in range(h_len + 1)] for _ in range(r_len + 1)]

    for i in range(1, r_len + 1):
        dp[i][0] = (i, 0, i, 0)  # All deletions

    for j in range(1, h_len + 1):
        dp[0][j] = (j, 0, 0, j)  # All insertions

    for i in range(1, r_len + 1):
        for j in range(1, h_len + 1):
            if ref_tokens[i - 1] == hyp_tokens[j - 1]:
                dp[i][j] = dp[i - 1][j - 1]
            else:
                # 1. Substitution
                sub_cost = dp[i - 1][j - 1][0] + 1
                # 2. Deletion
                del_cost = dp[i - 1][j][0] + 1
                # 3. Insertion
                ins_cost = dp[i][j - 1][0] + 1

                min_cost = min(sub_cost, del_cost, ins_cost)
                if min_cost == sub_cost:
                    cost, s, d, ins = dp[i - 1][j - 1]
                    dp[i][j] = (cost + 1, s + 1, d, ins)
                elif min_cost == del_cost:
                    cost, s, d, ins = dp[i - 1][j]
                    dp[i][j] = (cost + 1, s, d + 1, ins)
                else:
                    cost, s, d, ins = dp[i][j - 1]
                    dp[i][j] = (cost + 1, s, d, ins + 1)

    _cost, s, d, ins = dp[r_len][h_len]
    return s, d, ins


def compute_wer(reference: str, hypothesis: str) -> Dict[str, Any]:
    """Calculate Word Error Rate (WER) and decomposition metrics."""
    ref_norm = normalize_text(reference)
    hyp_norm = normalize_text(hypothesis)

    ref_words = ref_norm.split() if ref_norm else []
    hyp_words = hyp_norm.split() if hyp_norm else []

    if not ref_words:
        wer = 1.0 if hyp_words else 0.0
        return {
            "wer": wer,
            "substitutions": 0,
            "deletions": 0,
            "insertions": len(hyp_words),
            "ref_length": 0,
            "hyp_length": len(hyp_words),
        }

    s, d, ins = compute_levenshtein_matrix(ref_words, hyp_words)
    wer = (s + d + ins) / len(ref_words)

    return {
        "wer": round(wer, 4),
        "substitutions": s,
        "deletions": d,
        "insertions": ins,
        "ref_length": len(ref_words),
        "hyp_length": len(hyp_words),
    }


def compute_cer(reference: str, hypothesis: str) -> Dict[str, Any]:
    """Calculate Character Error Rate (CER)."""
    ref_chars = list(normalize_text(reference).replace(" ", ""))
    hyp_chars = list(normalize_text(hypothesis).replace(" ", ""))

    if not ref_chars:
        cer = 1.0 if hyp_chars else 0.0
        return {"cer": cer, "ref_length": 0, "hyp_length": len(hyp_chars)}

    s, d, ins = compute_levenshtein_matrix(ref_chars, hyp_chars)
    cer = (s + d + ins) / len(ref_chars)

    return {
        "cer": round(cer, 4),
        "substitutions": s,
        "deletions": d,
        "insertions": ins,
        "ref_length": len(ref_chars),
        "hyp_length": len(hyp_chars),
    }


def evaluate_corpus(pairs: List[Tuple[str, str]]) -> Dict[str, Any]:
    """Evaluate aggregate WER and CER metrics over an entire dataset of (reference, hypothesis) pairs."""
    total_ref_words = 0
    total_s = 0
    total_d = 0
    total_ins = 0

    total_ref_chars = 0
    total_char_s = 0
    total_char_d = 0
    total_char_ins = 0

    sample_results = []

    for ref, hyp in pairs:
        w_res = compute_wer(ref, hyp)
        c_res = compute_cer(ref, hyp)

        total_ref_words += w_res["ref_length"]
        total_s += w_res["substitutions"]
        total_d += w_res["deletions"]
        total_ins += w_res["insertions"]

        total_ref_chars += c_res["ref_length"]
        total_char_s += c_res["substitutions"]
        total_char_d += c_res["deletions"]
        total_char_ins += c_res["insertions"]

        sample_results.append({
            "reference": ref,
            "hypothesis": hyp,
            "wer": w_res["wer"],
            "cer": c_res["cer"],
        })

    aggregate_wer = (total_s + total_d + total_ins) / total_ref_words if total_ref_words > 0 else 0.0
    aggregate_cer = (total_char_s + total_char_d + total_char_ins) / total_ref_chars if total_ref_chars > 0 else 0.0

    return {
        "samples_evaluated": len(pairs),
        "aggregate_wer": round(aggregate_wer, 4),
        "aggregate_cer": round(aggregate_cer, 4),
        "total_words": total_ref_words,
        "substitutions": total_s,
        "deletions": total_d,
        "insertions": total_ins,
        "accuracy_word_pct": round((1.0 - aggregate_wer) * 100, 2),
        "sample_details": sample_results,
    }


def print_evaluation_report(results: Dict[str, Any]) -> None:
    """Print an academic evaluation report formatted as an ASCII table."""
    print("=" * 70)
    print(" 📊 YAPPER ACOUSTIC EVALUATION REPORT")
    print("=" * 70)
    print(f" Samples Evaluated    : {results['samples_evaluated']}")
    print(f" Total Reference Words: {results['total_words']}")
    print(f" Word Error Rate (WER): {results['aggregate_wer'] * 100:.2f}%")
    print(f" Char Error Rate (CER): {results['aggregate_cer'] * 100:.2f}%")
    print(f" Word Accuracy        : {results['accuracy_word_pct']:.2f}%")
    print("-" * 70)
    print(" Levenshtein Breakdown:")
    print(f"   • Substitutions (S): {results['substitutions']}")
    print(f"   • Deletions (D)    : {results['deletions']}")
    print(f"   • Insertions (I)   : {results['insertions']}")
    print("=" * 70)


if __name__ == "__main__":
    # Sample LibriSpeech / CommonVoice reference-hypothesis test suite
    test_corpus = [
        ("the quick brown fox jumps over the lazy dog", "the quick brown fox jumped over the lazy dog"),
        ("speech recognition systems evaluate word error rate", "speech recognition systems evaluate word error rate"),
        ("silero voice activity detection runs on device", "silero voice activity detector runs on device"),
        ("streaming audio over duplex websockets eliminates latency", "streaming audio over duplex websocket eliminate latency"),
        ("deep filter net suppresses stationary noise", "deep filter net suppress stationary noise"),
    ]

    report = evaluate_corpus(test_corpus)
    print_evaluation_report(report)
