# imagegen (bundled)

The image dispatcher used by `engine/scripts/images.mjs`. It's vendored from the standalone
`imagegen` skill in this repository collection, so video-maker is self-contained.

- `scripts/imagegen.sh <spec.json> [--force]` runs one job. `manifest.json`, written last and
  atomically in `~/imagegen/jobs/<job_id>/` (`IMAGEGEN_ROOT` overrides), is the only completion
  signal.
- Backends: `scripts/backends/codex.sh` (Codex CLI's built-in image tool, confined to the job
  directory) and `scripts/backends/comfy.sh` → `comfy_backend.py` (local ComfyUI, `COMFY_URL`,
  default `http://127.0.0.1:8199`; its model families are specific to one install).
- `reference/backends.md` covers the spec and manifest schema and how to add a backend;
  `reference/prompting.md` covers prompt craft.

Video projects shouldn't call these scripts directly: declare images in `storyboard.images` and
run `images.mjs` (`references/images.md`). When updating from the upstream skill, copy `scripts/`
and `reference/` over and re-run a test image.
