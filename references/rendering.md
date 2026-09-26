# Rendering

```bash
node engine/scripts/render.mjs <project> [options]
```

| Option | Default | Meaning |
|---|---|---|
| `--quality draft|standard|high` | standard | draft: JPEG frames, CRF 28, veryfast, short side capped at 720 px · standard: JPEG q92, CRF 20 · high: PNG frames, CRF 16, slow |
| `--height H` / `--scale k` | 1× | output size; the page is rendered at `deviceScaleFactor = k`, so text and SVG stay sharp (not upscaled) |
| `--fps N` | canvas.fps | any rate; the timeline is resampled (24/25/30/50/60 all fine) |
| `--workers N` | min(4, cores/2) | parallel browser pages rendering disjoint frame ranges, concatenated losslessly |
| `--scene id` · `--from s --to s` | whole video | partial renders for iteration |
| `--format mp4|webm|png` | mp4 | png writes a frame sequence directory |
| `--codec h264|h265` | h264 | h265 is ~40 % smaller; h264 plays everywhere |
| `--audio file [--audio-offset s]` | — | mux an audio track (AAC/Opus), trimmed to the video |
| `--out path` | `out/<slug>-<W>x<H>-<fps>fps[-draft].mp4` | |
| `--force` | — | render even if the composition reported errors |
| `--chrome path` | Playwright's Chromium | or env `VM_CHROME` |

## Presets (`new-project.mjs --preset`)

| Preset | Design canvas | Typical use |
|---|---|---|
| `1080p` | 1920×1080 @30 | default |
| `720p` | 1280×720 @30 | quick drafts, email |
| `1440p` | 2560×1440 @30 | |
| `4k` | 1920×1080 @30, render `--height 2160` | author at 1080p, render at 2× |
| `vertical` | 1080×1920 @30 | Reels/Shorts/TikTok |
| `square` | 1080×1080 @30 | feeds |
| `portrait` | 1080×1350 @30 | LinkedIn/Instagram portrait |
| `cinema` | 1920×816 @24 | 2.35:1 |

Author at the design size; use `--height` for bigger outputs. Changing aspect later means changing
`canvas` and re-checking layout (gate 3 will tell you what broke).

## Performance

Cost ≈ frames × (seek + screenshot + encode). Measured on a 2-core container: ~4.5 frames/s for
the 50 s demo at 720p draft (3D and contour scenes are the slow ones); expect several times that on
a many-core workstation with `--workers 8`. `check.mjs` prints a per-frame estimate.

- Draft first, always. Iterate on single scenes with `--scene`.
- `high` quality uses PNG frames — ~2× slower than JPEG; use it for the final only.
- WebGL runs on SwiftShader (CPU) in headless mode for determinism; keep meshes ≲ 50k vertices.
- Cache expensive per-frame work on unchanged inputs (see how `field` skips recontouring).

## Troubleshooting

| Problem | Fix |
|---|---|
| `could not launch Chromium` | `cd engine && npx playwright install chromium`, or `--chrome /usr/bin/chromium` |
| `ffmpeg not found` | install ffmpeg; `doctor.mjs` checks |
| Composition reported errors | run `check.mjs` for details; `--force` only for debugging |
| Faint seams/flicker between worker ranges | re-render with `--workers 1` to confirm; it indicates non-determinism — run `check.mjs` |
| Colours shift vs. preview | renders are sRGB/yuv420p (BT.709); extremely saturated reds/blues lose a little. Avoid pure #ff0000/#0000ff |
| Banding in gradients | `--quality high`, or add subtle noise texture to large gradients |
