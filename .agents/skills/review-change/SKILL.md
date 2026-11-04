---
name: review-change
description: Review a change in this repository before it is committed or merged - your own work, a branch, or a pull request. Use when asked to review, check, or sign off on changes, or before reporting a task as done.
---

# Review a change

Review against this repository's own rules in `AGENTS.md`; this skill is the checklist.
Report findings as: file:line, what is wrong, a concrete failure scenario, and the fix.
Do not report style preferences the linters do not enforce.

## 1. Gather the change

- Local work: `git status` and `git diff` (staged and unstaged).
- A branch: `git log --oneline <base>..HEAD` and `git diff <base>...HEAD`.

## 2. Verify, do not trust

Run `python scripts/verify.py`. A change is not done while it fails or prints "NOT COMPLETE"
for a check the change touches. Quote failures exactly.

## 3. Correctness

- Does every behavior change come with a test (`*.test.ts` next to the source, or `services/yapper-engine/tests/`) that fails without it? Tests never call a real STT provider or download a model.
- Audio format: the engine expects raw 16 kHz 16-bit mono PCM; the AudioWorklet downsampler (`PCM_DOWNSAMPLER_WORKLET_CODE` in `packages/core/src/audio/audioProcessor.ts`) produces it.
- `@yapper/react` imports `@yapper/core` from its `dist/`: core changes are built before react is typechecked.

## 4. Repository invariants

- **Privacy**: raw audio and transcripts are never stored or logged outside the request.
- **Model downloads**: checksum verification, OS trust store TLS and safe tar extraction in `model_loader.py` stay intact; `model_checksums.py` only changes through `scripts/upload_models_to_r2.py` (see the `publish-model` skill).
- **Engine URL**: the HUD reads `YAPPER_ENGINE_URL` (default `http://localhost:8000`) and falls back to `8089`; keep both working.
- **Never committed**: model archives (`dist/*.tar.gz`), `.env`, API keys.
- **Secrets**: no provider keys in the diff, logs or error messages.

## 5. Commits

- Format `<type>(<scope>): <subject>` with the types and scopes in `AGENTS.md`.
- Atomic: refactor, then fix/feat, then test; at most 5 staged files per commit (lockfiles and docs excluded); config not mixed with source.
- Each commit builds and passes tests on its own.
- No mention of AI tools in commit messages.

## 6. Verdict

End with one line: `ready`, `ready after fixes listed above`, or `not ready: <reason>`.
