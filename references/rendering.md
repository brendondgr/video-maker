# Rendering

```bash
node engine/scripts/render.mjs <project> [options]
```

Two engines render the same composition (parity checked at ≈ 37 dB PSNR):

| | `--engine vm` (default) | `--engine hf` (HyperFrames) |
|---|---|---|
| Capture | Playwright, `__vm.seek` + screenshot per frame, N workers | Puppeteer beginFrame capture, parallel workers — ~3× faster |
| Partial renders | `--scene`, `--from/--to` | whole composition only |
| Formats | mp4 (h264/h265), webm, png frames | mp4, webm, mov, gif, png-sequence; `--docker` (byte-identical across machines), `--gpu` encode |
| Audio | muxes `audio/mix.wav` | mixes the page's `<audio id="vm-mix">` (same file) |

**Resolution policy: 1080p (the canvas size) or 4K (`--4k`, exactly 2×). Drafts lower encode
quality, never resolution.**

| Option | Default | Meaning |
|---|---|---|
| `--engine vm|hf` | vm | see above |
| `--quality draft|standard|high` | standard | vm — draft: JPEG frames, CRF 28, veryfast · standard: JPEG q92, CRF 20 · high: PNG frames, CRF 16, slow. hf — draft / looks / delivery |
| `--4k` (or `--height 2×`) | canvas size | 2× output; the page renders at `deviceScaleFactor = 2`, so text and SVG stay sharp (not upscaled) |
| `--fps N` | canvas.fps | any rate; the timeline is resampled (24/25/30/50/60 all fine) |
| `--workers N` | min(4, cores/2) | parallel browser pages rendering disjoint frame ranges, concatenated losslessly |
| `--scene id` · `--from s --to s` | whole video | partial renders for iteration |
| `--format mp4|webm|png` | mp4 | png writes a frame sequence directory |
| `--codec h264|h265` | h264 | h265 is ~40 % smaller; h264 plays everywhere |
| audio | `audio/mix.wav` if present | `--audio file [--audio-offset s]` overrides; `--no-audio` renders silent |
| `--deliver dir` | — | copy `<slug>.mp4` (or `<slug>-4k.mp4`) + `<slug>.srt/.vtt` + `poster.png` (`meta.poster_t`, default 40 %) to `dir`. Layout-1 projects keep the old `<slug>-WxH-fps` names |
| `--with-edit` | — | with `--deliver`: also copy the edit package (`edit/`) |
| `--out path` | `out/<slug>-<W>x<H>-<fps>fps[-draft].mp4` | |
| `--force` | — | render even if the composition reported errors |
| `--chrome path` | Playwright's Chromium | or env `VM_CHROME` |

## Presets (`new-project.mjs --preset`)

| Preset | Design canvas | Typical use |
|---|---|---|
| `1080p` | 1920×1080 @30 | default |
| `4k` | 1920×1080 @30, render `--4k` | author at 1080p, render at 2× |
| `vertical` | 1080×1920 @30 | Reels/Shorts/TikTok |
| `square` | 1080×1080 @30 | feeds |
| `portrait` | 1080×1350 @30 | LinkedIn/Instagram portrait |
| `cinema` | 1920×816 @24 | 2.35:1 |

Author at the design size; use `--4k` for the 2× output. Changing aspect later means changing
`canvas` and re-checking layout (gate 3 will tell you what broke).

## Performance

Cost ≈ frames × (seek + capture + encode). Measured on a 32-core Ryzen AI Max+ 395: the 50.7 s
demo at 1080p renders in ~25 s with `--engine vm` (4 workers, ~60 frames/s) and ~9 s with
`--engine hf`. 3D and contour scenes are the slow ones. `check.mjs` prints a per-frame estimate.

- Draft first, always (full resolution). Iterate on single scenes with `--scene` (vm engine).
- `high` quality uses PNG frames — ~2× slower than JPEG; use it for the final only.
- WebGL runs on SwiftShader (CPU) in headless mode for determinism; keep meshes ≲ 50k vertices.
- Cache expensive per-frame work on unchanged inputs (see how `field` skips recontouring).

## Troubleshooting

| Problem | Fix |
|---|---|
| `could not launch Chromium` | `cd engine && npx playwright install chromium-headless-shell`, or `--chrome /usr/bin/chromium` |
| hf render: `timelines not registered` / blank frames | the page failed to boot under HyperFrames: run `node engine/scripts/hf.mjs <p> snapshot --at 1` and read the error text in the frame |
| hf render warns about V8 heap / workers | pass `--workers 4` |
| `ffmpeg not found` | install ffmpeg; `doctor.mjs` checks |
| Composition reported errors | run `check.mjs` for details; `--force` only for debugging |
| Faint seams/flicker between worker ranges | re-render with `--workers 1` to confirm; it indicates non-determinism — run `check.mjs` |
| Colours shift vs. preview | renders are sRGB/yuv420p (BT.709); extremely saturated reds/blues lose a little. Avoid pure #ff0000/#0000ff |
| Banding in gradients | `--quality high`, or add subtle noise texture to large gradients |
