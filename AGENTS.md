# Engineering Standards & Observability Contract

### 1. Pre-Change Invariant Manifest
Before executing code modifications touching more than one file, output a compact change manifest table:

| Target File / Module | Nature of Change | Breaking / Invariant Impact |
| :--- | :--- | :--- |
| `path/to/file` | `[refactor / feat / fix / rename]` | `None / Exposes new method / Renames prop` |

Do not output narrative summaries, conversational setups, or ad-hoc diagrams.

### 2. Diff Noise & Spurious Edit Invariants
- **No Unsolicited Formatting:** Do NOT reformat, re-indent, or adjust comments on lines unrelated to your assigned task. Leave untouched code exactly as it is.
- **Import Hygiene:** Do not randomly shuffle or re-order existing import statements unless adding or removing an active dependency.
- **Isolate Mass Renames:** If a task requires renaming an identifier across multiple files, isolate that rename into a dedicated `refactor(<scope>): rename X to Y` commit with ZERO other logic changes.

### 3. Conventional Commit Standards
All commits must follow:
`<type>(<scope>): <short imperative subject under 50 chars>`

- **Allowed Types:** `feat`, `fix`, `refactor`, `perf`, `chore`, `test`, `docs`, `build`, `ci` (add `model`, `data`, `eval`, `exp` for ML pipelines).
- **Allowed Scopes:** [`showcase`, `core`, `react`, `server`, `yapper-engine`, `clients`, `desktop-hud`, `config`, `deps`, `hooks`, `ci`, `docs`]
- **Rule:** Never mention AI, LLMs, or prompt tools in commit messages.

### 4. Commit Granularity & Invariants
- **Atomic Commits:** Do not bundle refactorings, feature code, and config tweaks into a single commit.
- **Commit Sequence:**
  1. `refactor(<scope>): ...` (Structural prep or renames only)
  2. `feat(<scope>): ...` or `fix(<scope>): ...` (Logic changes)
  3. `test(<scope>): ...` (Specs/tests)
- **Blast-Radius Cap:** A single commit must not exceed 5 staged files (excluding lockfiles/documentation).
- **Bisect Safety:** Every individual commit must compile and pass tests.

### 5. Definition of Done
- Run `python scripts/verify.py` (or `yarn verify`) before reporting a task complete. It runs exactly what CI runs: ruff over `services/yapper-engine`, `clients` and `scripts`; engine pytest; `@yapper/core` tests; typechecks for `core`, `react` and `showcase` (it builds `core` first, because `react` imports its `dist/`); and a secret scan when `gitleaks` is installed. Skipped checks are listed; "NOT COMPLETE" means you are not done.
- Narrow it while iterating: `--only python`, `--only node`, `--only secrets`.
- Python: uses `services/yapper-engine/.venv`; set `VERIFY_PYTHON` to override (e.g. in a git worktree).
- A task that changes behavior adds or updates a test (`*.test.ts` next to the source, or `services/yapper-engine/tests/`).

### 6. Repository Map
| Path | What lives there |
| :--- | :--- |
| `packages/core` | `TalkClient`, audio processing (energy VAD, AudioWorklet downsampler), engines: browser speech, cloud stream, local Whisper (Web Worker), streaming agreement |
| `packages/react` | `useTalk` hook, `TalkOrb`, `TalkDictationPill`, `LocalModelCard` |
| `packages/server` | Express gateway proxying audio to OpenAI / Groq / self-hosted Whisper; stores no audio |
| `apps/showcase` | Marketing and demo site (Vite); `src/App.tsx` is one large file |
| `services/yapper-engine` | FastAPI engine on port 8000: `GET /health`, `POST /api/transcribe`, WebSocket `/ws/audio`; pipeline in `src/engine/` (DSP, VAD, hallucination filter, formatter, model loader) |
| `clients/hud` | Tkinter desktop HUD that records audio and transcribes through the engine or locally |
| `scripts/` | Release builds, R2 publish/prune/model upload, `doctor.py` diagnostics, `verify.py` |

### 7. Commands
- Install: `yarn install`; engine: `cd services/yapper-engine && uv venv && uv pip install -r requirements.txt`
- Showcase: `yarn dev`
- Engine: `cd services/yapper-engine && python -m src.main` (settings via env, see `src/config.py`)
- Desktop HUD: `python clients/desktop_hud.py`
- Diagnose a machine: `python scripts/doctor.py`

### 8. Gotchas
- The AudioWorklet runs from the inline string `PCM_DOWNSAMPLER_WORKLET_CODE` in `packages/core/src/audio/audioProcessor.ts`; there is no separate worklet file.
- The HUD reads `YAPPER_ENGINE_URL` (default `http://localhost:8000`) and falls back to `http://localhost:8089`.
- `packages/server` has no `tsconfig.json`, so it is not typechecked yet.
- Model archives are downloaded and extracted at runtime by `src/engine/model_loader.py`; never commit them (`dist/*.tar.gz` is a local release cache).
- The loader only accepts R2 archives whose SHA-256 is in `src/engine/model_checksums.py`. `scripts/upload_models_to_r2.py` rewrites that file on every upload: commit it with the upload, because re-packing a model changes its hash. Never edit it by hand or switch TLS verification off: downloads use the OS trust store (`truststore`).
- Ruff rules are pinned in the root `ruff.toml`.

### 9. Never
- Never store or log raw user audio or transcripts outside the request.
- Never read, print or commit `.env` files or API keys.
- Never force-push or rewrite published history.
