# Backends — internals, spec schema, and how to extend

## 1. The shape of a job

```
~/imagegen/jobs/<job_id>/
  job.json          copy of the spec — the job dir is self-describing forever
  graph.api.json    (comfy only) the exact API graph that was queued
  out/              the images
  log/backend.log   everything the backend said
  .started          UTC timestamp, written before the backend runs
  .result.json      what the backend reported — internal, consumed by the manifest writer
  manifest.json     ★ written LAST, atomically. Presence == done.
```

`.result.json` is deliberately not the completion signal. It is one input to the manifest writer,
which also walks `out/` and reconciles the two — so a backend that lies about a path, or writes a
file it never mentions, is caught rather than believed.

## 2. Spec schema (`job.json`)

| Field | Req | Default | Notes |
|---|---|---|---|
| `job_id` | ✅ | — | bare slug, no `/` or leading `.`. Reuse refused without `--force`. |
| `backend` | | `comfy` | `comfy` \| `codex` |
| `model` | | `z-image-turbo` | comfy family; ignored by codex |
| `prompt` | ✅ | — | the fully expanded prompt |
| `negative` | | `""` | inert on all three comfy families (all run CFG 1.0); kept for future families |
| `size` | | `square` | `WxH`, or `square`/`portrait`/`landscape`/`wide`/`tall` |
| `filename` | | `image` | stem only; extension is added |
| `count` | | `1` | comfy: one batch; codex: one call per image |
| `seed` | | random | recorded in the manifest either way |
| `steps`, `cfg`, `sampler`, `scheduler`, `shift` | | per family | overrides; omit unless asked |

Size presets: `square` 1024×1024, `portrait` 832×1216, `landscape` 1216×832, `wide` 1344×768,
`tall` 768×1344. Everything is snapped to a multiple of 16 — legal for the /8 16-channel families
and required by FLUX.2, which pixel-unshuffles 2×2 on a /8 autoencoder.

The codex backend maps presets onto the sizes its API accepts: `square` → 1024×1024,
`portrait`/`tall` → 1024×1536, `landscape`/`wide` → 1536×1024.

## 3. Manifest schema

```json
{
  "job_id": "...", "backend": "comfy", "status": "ok|partial|error",
  "started": "2026-09-17T20:46:20Z", "finished": "2026-09-17T20:47:07Z",
  "exit_code": 0,
  "job_dir": "/home/bdgr/imagegen/jobs/...",
  "spec":   { ...the spec verbatim... },
  "params": { ...what the backend actually used, incl. the resolved seed... },
  "images": [{"path": "out/hero.png", "abs_path": "/home/...", "w": 1024, "h": 1024,
              "bytes": 1240564, "seed": 12345, "comfy_filename": "..._00001_.png"}],
  "warnings": [], "errors": [],
  "log_tail": "last 25 lines, present only when status != ok"
}
```

`status` is derived, not reported: `ok` = images and no errors, `partial` = images and errors,
`error` = no images. `params.seed` is the reproduction handle — rerun with that seed and the same
family to get the same picture.

## 4. The comfy backend

`scripts/comfy_backend.py`. Standard library only — no PIL, no requests, no websocket.

```
GET  /system_stats        fail fast and legibly if the server is down
POST /prompt              queue the graph; check node_errors even on 200
GET  /history/{id}        poll every 2 s; returns {} with status 200 while running
GET  /view?filename=...   pull each image back and write it into out/
```

Two ComfyUI behaviours the code defends against, both of which look like success:

- **`node_errors` can be non-empty on a 200.** A prompt with several output branches succeeds if
  *any* branch validates; the failed ones are reported there and silently skipped. Recorded as a
  warning.
- **`/history/{id}` returns `{}` with status 200 while running** — not a 404. Absence of the key,
  not an HTTP status, is the "still going" signal.

### Families

Each is a matched set of five things — loader, text encoder (+ the `CLIPLoader` `type` string), VAE,
latent node, patch node. Change one and you must change all five; ComfyUI's type system will not
catch a mismatch, it will just produce a shape error or a smeared image.

| | `z-image-turbo` | `krea2-turbo` | `flux2-klein` |
|---|---|---|---|
| UNET | `z_image_turbo_fp8_e4m3fn` | `krea2TurboFP8_krea2TURBO` | `flux-2-klein-9b-fp8` |
| encoder | `qwen_3_4b` | `qwen3vl_4b_bf16` | `qwen_3_8b_fp8mixed` |
| `type` | **`lumina2`** | `krea2` | `flux2` |
| VAE | `ae.safetensors` | `qwen_image_vae` | `flux2-vae` |
| latent | `EmptySD3LatentImage` | `EmptySD3LatentImage` | **`EmptyFlux2LatentImage`** |
| patch | `ModelSamplingAuraFlow` shift 3.0 | none | none |
| sampler | `res_multistep` / `simple` | `euler` / `simple` | `euler` + `Flux2Scheduler` |
| steps / cfg | 8 / 1.0 | 10 / 1.0 | 4 / 1.0 |

Three traps worth stating outright:

- **Z-Image's `type` is `lumina2`, and that is not a typo.** ComfyUI's `ZImage` class inherits from
  `Lumina2`. There is no `z_image` string in the enum; guessing one falls back to
  `STABLE_DIFFUSION` silently and fails later as an unrelated-looking shape error.
- **FLUX.2 cannot use `KSampler`.** `Flux2Scheduler` emits SIGMAS, so it needs the custom stack:
  `RandomNoise` + `CFGGuider` + `KSamplerSelect` + `Flux2Scheduler` → `SamplerCustomAdvanced`. It
  also has no `ModelSampling*` node — shift is derived from width/height inside the scheduler.
- **All three run CFG 1.0** because all three are guidance-distilled. Negative prompts do nothing.
  Z-Image still requires the negative socket to be *connected*, which is why an empty
  `CLIPTextEncode` is wired in; FLUX.2 uses `ConditioningZeroOut` instead.

### Adding a family

Never from memory. The model list on this box changes.

```bash
curl -s http://127.0.0.1:8199/object_info > /tmp/oi.json
python3 -c "
import json; oi=json.load(open('/tmp/oi.json'))
print(oi['UNETLoader']['input']['required']['unet_name'][0])
print(oi['CLIPLoader']['input']['required']['type'][0])"
```

Then: confirm every filename appears in the live enum, confirm the `type` string is in the enum,
add a builder returning `(graph, save_node_id)`, register it in `FAMILIES`, and run it once
end to end and *look at the output image*. A wrong matched set frequently produces a plausible
image file rather than an error.

The compatibility matrix for every family on this machine, including video, lives in the
`comfyui-strix-halo` skill — `reference/04-model-families.md`.

## 5. The codex backend

`scripts/backends/codex.sh`. Codex is used as a **payment shim**: its built-in `image_gen` tool
rides the existing subscription auth, so no `OPENAI_API_KEY` is needed. That is the only reason to
put an agent in this path at all, so it is given a finished prompt, a fixed output path, and an
explicit instruction not to decide anything.

```
codex exec --cd "$JOB" -s workspace-write --skip-git-repo-check "$INSTRUCTION" </dev/null
```

Each flag earns its place:

- `--cd "$JOB"` — working root is the job directory. A nested agent with file-write access should
  never be pointed at a real repository.
- `-s workspace-write` — writes confined to that directory. **Do not** replace this with
  `--dangerously-bypass-approvals-and-sandbox`.
- `--skip-git-repo-check` — the job directory is deliberately not a git repo.
- **`</dev/null` is mandatory.** `codex exec` treats a non-TTY stdin as piped input and blocks
  forever waiting for EOF (`Reading additional input from stdin...`). Under a background runner that
  is an invisible hang, not an error. This was hit in testing; do not remove it.

The agent's own account of what it did is ignored. After it exits, the adapter walks `out/` and
builds `.result.json` from the files that actually exist.

Codex may take small liberties inside its remit — in testing it generated at 1254×1254 and ran
`magick -resize` to hit the requested 1024×1024 unasked. Harmless, and confined, but it is why the
file system rather than the transcript is treated as the source of truth.

## 6. Why no `grok`, `muse`, or `agy` backend

Of the four CLIs originally considered, only Codex can generate images and is installed here.
`grok` and `agy` are not on this machine. `muse` is a coding agent on Muse Spark — it accepts image
*input* and cannot generate. Adding a `grok` backend later means one new `backends/grok.sh`
following the same contract: write `out/`, write `.result.json`, exit non-zero on failure.

## 7. Verified on this machine — 2026-09-17

| Test | Result |
|---|---|
| `z-image-turbo`, 1024², seed 12345 | ok, 46 s incl. model load |
| `flux2-klein`, landscape, in-image text "OPEN" | ok, 40 s, text rendered correctly |
| `krea2-turbo`, portrait, `count: 2` | ok, 2 m 23 s, both files numbered |
| `codex`, logo badge with wordmark | ok, 60 s, no API key |
| unknown family / no prompt / server down | `status: error`, legible message |
| backend `kill -9` mid-run | `status: error`, exit 137, manifest still written |
| `--detach` | returns in 10 ms, manifest appears 48 s later |
| reused `job_id` | refused; `--force` clears and reruns |
