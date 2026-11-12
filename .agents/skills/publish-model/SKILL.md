---
name: publish-model
description: Publish or update a Whisper model archive on the Cloudflare R2 CDN that Yapper downloads models from, keeping the checksum list in the repository in sync. Use when asked to add a model size, re-publish a model, or fix model download or checksum errors.
---

# Publish a model to R2

The engine and the desktop HUD download model archives from R2 at runtime (`src/engine/model_loader.py`)
and only accept an archive whose SHA-256 is listed in
`services/yapper-engine/src/engine/model_checksums.py`. Publishing and the checksum list must change together.

## Steps

1. Credentials come from the environment (`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`).
   Never print them, and never read `.env` files to find them: ask the person to set them.
2. Run `python scripts/upload_models_to_r2.py --model <name>` (or `--models a b`, `--all`). It packs
   `dist/<name>.tar.gz` (or reuses it), uploads to `yapper/models/` in the `luisenrique-releases` bucket, and
   **rewrites `model_checksums.py`** with the hash of exactly what it uploaded.
3. Commit `model_checksums.py` in the same change as the upload:
   `build(yapper-engine): publish <name> model`.
4. Check the live archive matches:
   ```python
   from src.engine import model_loader
   model_loader.download_from_r2_cdn("<name>")   # True = downloaded, checksum matched, extracted
   ```
   Run it with `YAPPER_CACHE_DIR` pointing at a scratch folder so the real cache is not touched.

## Rules

- **Re-packing changes the hash.** Never re-run the upload for a model without committing the new checksum,
  or every client rejects the archive and falls back to Hugging Face.
- **Never edit `model_checksums.py` by hand**, and never weaken the loader: no `verify=False`, no skipping
  the checksum, no unfiltered `tar.extractall`. TLS goes through the OS trust store (`truststore`).
- `dist/` is a local cache; never commit archives.

## Done when

`python scripts/verify.py` passes and the download check above returns `True`.
