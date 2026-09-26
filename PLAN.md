# Plan: video-maker × HyperFrames

Goal: one skill that keeps what video-maker does well (plan-first storyboards, evidence-backed
content, science/data helpers, QA gates with visual review) and adds what HyperFrames
(HeyGen, Apache-2.0, pinned at **v0.8.77**) does well (renderer, audio mixing, captions, motion
library, design presets, registry blocks, Studio, media tooling), plus local GPU narration.

Tracking: this file is updated in every commit on the `unify-hyperframes` branch; the draft PR
mirrors it. `[x]` = done and committed, `[~]` = in progress, `[ ]` = not started.

## Principles

1. **One entry point.** `SKILL.md` stays the only workflow. HyperFrames skills become references
   it routes to, not parallel workflows.
2. **Every project is both.** A video-maker project is also a valid HyperFrames composition, so
   either renderer, either linter and HyperFrames Studio all work on the same files.
3. **Plan → build → check → render is unchanged.** New capabilities slot into existing phases.
4. **Local first.** Everything works offline without accounts. HeyGen-account features
   (catalog BGM/images, cloud render) are optional add-ons, clearly marked.
5. **Deterministic.** Picture and sound are pure functions of the storyboard + assets.
6. **Attribution.** Vendored/ported HyperFrames material keeps its Apache-2.0 licence and a
   NOTICE of changes.

## What comes from where

| Capability | video-maker today | From HyperFrames | Result |
|---|---|---|---|
| Planning | brief + evidence bank + storyboard.json + validator | narration 2.5 w/s, beat direction, story spine, storyboard recipe | ours, enriched with their rules |
| Scene authoring | `VM.scene` builders on one GSAP timeline | 43 motion rules, 22 blueprints (GSAP snippets) | ours + ported helpers/blueprints |
| Transitions | 8 | ~30 CSS/GSAP families + presets | add ~9 that suit explainers |
| Design system | palette/fonts in storyboard.style | `frame.md` design spec, 13 presets, 9 palettes, typography rules | read `frame.md` into style tokens |
| Rendering | Playwright seek + FFmpeg, parallel | Puppeteer beginFrame renderer, mov/gif/hls, Docker, Lambda/Cloud Run | `render.mjs --engine vm|hf` |
| QA | 5 gates, contact sheets, visual rubric | `lint`, `check` (layout, motion, contrast), `snapshot`, `compare` | HF lint/check become gate 2b/3b |
| Voice | narration fields, no TTS | Kokoro via CPU onnx, no word timings | **our GPU `kokoro-tts` with word timings** (theirs as fallback) |
| Timing to voice | beats by id | word-timestamp captions | retime scenes/beats from word timings |
| Mixing | one `--audio` file | multi-track `<audio>`, volume automation, ducking, FX chains, loudnorm | one mix plan → FFmpeg (vm) or `<audio>` elements (hf) |
| SFX / music | none | 19 bundled SFX (Pixabay licence), MusicGen local, HeyGen catalog | bundled SFX + optional BGM |
| Captions | none | caption rules, grouping, 15 caption blocks, transcribe | `VMX.captions` from word timings + SRT/VTT |
| Preview/editing | scrubber preview | Studio timeline editor | `hyperframes preview` on our projects |
| Media tools | none | transcribe, remove-background, media-use ledger | wrapped via `hf.mjs` |

## Phases

### Resolution policy
Renders are 1080p (canvas size) or 4K (`--4k`); drafts lower encode quality, never resolution.

### Phase 0 — Local narration engine
- [x] `tts/kokoro_tts.py`: CLI (line, file, batch job, `--check`) → 24 kHz WAV + word-timing JSON
- [x] `tts/install.sh`: one environment at `~/venvs/kokoro`, backend auto-detect (ROCm per gfx
      family / CUDA / XPU / MPS / CPU), guard against kokoro replacing the GPU torch, global
      `kokoro-tts` launcher that re-executes on the host from toolbox/distrobox
- [x] Verified on Strix Halo (gfx1151, ROCm 7.13 nightly): RTF ≈ 0.28
- [x] `tts/install.ps1` for Windows (CUDA / ROCm TheRock wheels / CPU) — written, not yet run on Windows

### Phase 1 — HyperFrames interop (every project is both)
- [x] Runtime: drive scene visibility + `onFrame` from a master `onUpdate` so any external seek
      (HyperFrames' adapter) produces the same frame as `__vm.seek`
- [x] Root element carries `data-composition-id="main" data-width data-height data-duration`,
      kept in sync with storyboard.json by the scripts (duration must be static for HF)
- [x] Pin `hyperframes@0.8.77` in `engine/package.json`; `scripts/hf.mjs` bridge
      (`lint | check | render | snapshot | preview | transcribe | remove-background | …`) with
      telemetry off by default (`HYPERFRAMES_NO_TELEMETRY=1`, override with `--telemetry`)
- [x] `render.mjs --engine hf` delegates to `hyperframes render`; parity test on the example
      (same frames within tolerance) — PSNR 37.6 dB avg vs vm engine; 9 s vs 25 s for 50.7 s
- [x] Engine paths made relative (`_engine` link per project, `engine/fonts.css`), render mode is
      the default and our scrubber mounts only with `?preview`, so HF render/Studio get clean frames

### Phase 2 — HyperFrames knowledge in the skill
- [x] Vendor the 10 skills (`hyperframes`, `-core`, `-cli`, `-studio`, `-keyframes`,
      `-animation`, `-creative`, `-registry`, `-audio`, `media-use`) under
      `vendor/hyperframes/skills/` with LICENSE + NOTICE; `scripts/sync-hyperframes.mjs` to
      update the pin (vendored from tag v0.8.77, unmodified)
- [x] `references/hyperframes.md`: bridge commands, modes, translation table, routing table
- [ ] `SKILL.md` routing table: when to read which vendored reference, and what does *not* apply
      (their `data-start` clip model, CSS/WAAPI adapters) inside `VM.scene` builders
- [x] Two authoring modes documented: **scenes** (default; storyboard + builders) and **native
      HyperFrames** (for footage-heavy edits, registry blocks, Studio-first editing) sharing the
      same audio, QA and render steps

### Phase 3 — Voice, mix, captions
- [x] `scripts/voiceover.mjs`: storyboard narration → `kokoro-tts --batch` (cached by text/voice
      hash) → `audio/timing.json` (fallback providers: later)
- [x] Retime: scene duration fits its narration (+ pads, next transition); beats with
      `cue: "word:N" | "text:phrase"` snap to word times; others scale; silent values kept in
      `scene.silent` so retiming is repeatable
- [x] Mix `audio/mix.wav` (voice, optional BGM bed sidechain-ducked per HF operations.md, SFX
      cues) with two-pass loudnorm (−16 LUFS, TP −1.5) — verified −16.0 LUFS / −1.5 dBTP
- [x] Renderers: `vm` muxes the mix automatically; `hf` plays it as `<audio id="vm-mix">` synced
      into the page (identical sound on both engines)
- [x] HF's 19 SFX (Pixabay licence, vendored in media-use) + manifest; `scene.sfx` cues on beats
- [x] `VMX.captions` (grouping, emphasis, hard kill at group end, per HF caption rules) +
      `audio/captions.srt/.vtt` — built as the first `VM.overlay` (whole-video layers)
- [~] Optional BGM: user file (done: `audio.music.src`), MusicGen on the GPU env (weights are CC-BY-NC — flagged), or
      `media-use resolve --type bgm` with a HeyGen account
- [x] Gates: narration never cut by a scene end; audio/video duration match; loudness in range

### Phase 4 — Motion and design
- [x] Transitions: `crossfade`, `blur-crossfade`, `zoom-through`, `push` (4 directions), `squeeze`,
      `diamond-iris`, `diagonal-split`, `focus-pull`, `color-dip`, `whip-pan`, `staggered-blocks`,
      `grid-dissolve` (runtime/transitions.js; transitions now receive the outgoing scene too)
- [x] Helpers (helpers/figures.js): `hubSpokes`, `cycle`, `camera`, `ring`, `pulse` (word-cue
      emphasis). `pathDraw`/`marker`/`typeSeq` already covered by `draw`/`highlight`/`swap`
- [x] `design.mjs`: any HF frame preset (13 vendored) or frame.md → `storyboard.style` palette +
      fonts (web fonts downloaded once into assets/fonts), `--f-display` token for headings
- [ ] Fold HF typography minimums, data-in-motion "no" list, transition-count rule and beat
      direction vocabulary into `references/motion-design.md`; blueprints mapped to our
      visual catalog

### Phase 5 — QA
- [x] `qa.mjs` Gate 3b runs `hyperframes check --json` (lint + runtime + layout + motion +
      contrast); findings merged into `qa/report.md`, transition-window overlaps downgraded to info
- [ ] (later) Generate HF `*.motion.json` assertions from beats (`appearsBy`) for `check`

### Phase 6 — Install everywhere
- [x] `references/install.md`: Linux / macOS / Windows × AMD ROCm / NVIDIA CUDA / Intel XPU /
      Apple MPS / CPU for kokoro-tts, Node/FFmpeg/Chromium for the engine, HyperFrames extras
      (whisper.cpp, Docker)
- [x] `doctor.mjs` reports TTS + HyperFrames status (`--tts` runs a timed synthesis)

### Phase 7 — Deliverables: Co-Scientist (Nature 2026, doi:10.1038/s41586-026-10644-y)
- [ ] 30 s — one message: a multi-agent AI that generates, debates and evolves hypotheses, and
      lab-validated them
- [ ] 60 s — how it works (agents + tournament) + the three validations
- [ ] 5 min — chapters: problem · architecture · tournament/Elo scaling · expert evaluation ·
      AML · liver fibrosis · AMR · limitations · outlook
- [ ] Each: narrated (kokoro-tts), captioned, QA-passing, 1080p30 MP4 + SRT, delivered to
      `~/Videos/CustomSkill/` via `render.mjs --deliver`

## Later / optional
- Per-scene sub-composition export so HyperFrames Studio shows one editable row per scene
- Registry blocks inside scene mode (`hf-block` scene type rendered as a sub-composition)
- Shader transitions, `world-map`, code-window blocks via the hf engine
- Cloud/Lambda rendering (needs accounts)

## Decisions and open questions
- **BGM licence:** MusicGen weights are CC-BY-NC 4.0 (non-commercial). Default for the
  Co-Scientist videos: narration + light SFX, no generated music unless requested.
- **Telemetry:** HyperFrames telemetry is on by default upstream; our bridge turns it off.
- **Pin:** HyperFrames moves fast (v0.8.77 on 2026-09-25); upgrades go through
  `sync-hyperframes.mjs` + the parity test.
