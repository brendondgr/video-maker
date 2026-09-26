# HyperFrames inside video-maker

[HyperFrames](https://github.com/heygen-com/hyperframes) (HeyGen, Apache-2.0) is an HTML-to-video
framework built on the same idea as this skill: a paused GSAP timeline, seeked frame by frame.
video-maker is pinned to **v0.8.77**: the CLI in `engine/package.json`, and ten of its skills
vendored unmodified under `vendor/hyperframes/skills/`. Update both with
`node engine/scripts/sync-hyperframes.mjs --version X` plus a matching `npm i -E hyperframes@X`
in `engine/`, then re-run the parity check (end of this file).

**This skill stays the entry point.** The vendored `hyperframes/SKILL.md` describes itself as a
mandatory entry point with its own intake, brief and routing. Inside video-maker, ignore that
routing: `SKILL.md` here owns intake, the brief, the storyboard and QA. Read the vendored skills
as **reference libraries** for motion, design, audio, captions, media and CLI detail.

## Every project is both

`engine/scripts/lib/hf.mjs` runs whenever any script opens a project. It keeps two things in
sync:

- **`_engine` link.** A link inside the project to the engine, git-ignored. Every asset path is
  relative, so HyperFrames' static server resolves them.
- **Root attributes.** `<div id="stage" data-composition-id="main" data-width data-height
  data-duration data-fps>`, with values from `storyboard.json`. HyperFrames reads the duration
  once, statically, so it must be written into the HTML.

The runtime registers `window.__timelines.main`. It drives scene visibility and `onFrame`
drawing from the master timeline's `onUpdate`, so HyperFrames' GSAP seek and our `__vm.seek`
produce the same frame. On `examples/gradient-descent` the two renderers agree at 37.6 dB PSNR.

Run any HyperFrames command on a project through the bridge. It syncs the project first and
turns telemetry off; pass `--telemetry` to leave it on.

```bash
node engine/scripts/hf.mjs <project> lint                # static composition checks
node engine/scripts/hf.mjs <project> check --json        # lint + layout/contrast/motion sweep in Chrome
node engine/scripts/hf.mjs <project> preview             # HyperFrames Studio (timeline editor)
node engine/scripts/hf.mjs <project> snapshot --at 2,8,15
node engine/scripts/hf.mjs <project> transcribe audio/voiceover.wav    # whisper.cpp word timings
node engine/scripts/hf.mjs <project> remove-background assets/me.mp4 -o assets/me.webm
node engine/scripts/hf.mjs . catalog --query chart       # browse registry blocks
node engine/scripts/render.mjs <project> --engine hf     # HyperFrames renderer (fast beginFrame capture)
```

## Two authoring modes

| | **Scene mode** (default) | **Native HyperFrames mode** |
|---|---|---|
| Use for | Explainers, paper and concept summaries, data stories: anything planned scene by scene | Editing footage (cuts, trims, punch-ins), captions or overlays on existing video, beat-synced music edits, pages built mainly from registry blocks, Studio-first hand editing |
| Source of truth | `storyboard.json` + `scenes/<id>.js` (`VM.scene`) | `index.html` + `compositions/*.html` with `data-start`/`data-duration` clips |
| Read | this skill's references, then vendored HF references for technique | vendored `hyperframes-core` → `-keyframes` / `-audio` / `-registry` / `media-use` |
| Build helpers | `VMX.*` helpers, storyboard beats, `ctx.at()` | HF clips, sub-compositions, registry blocks |
| Shared | brief + evidence bank, `voiceover.mjs` narration, SFX, QA (`hf.mjs lint/check`, contact sheets, visual rubric), `render.mjs --engine hf`, `verify-output.mjs` | same |

Pick native mode only when the deliverable really is footage editing or a block assembly. When
native mode is chosen, scaffold with `node engine/scripts/hf.mjs <dir> init …` (or by hand, per
`vendor/hyperframes/skills/hyperframes-core/references/minimal-composition.md`). Still write
`brief.md` first, and still finish with this skill's QA and hand-off steps.

## Using HyperFrames technique in scene mode

The motion rules, blueprints and transitions in `hyperframes-animation`, and the caption motion
in `media-use`, are almost all plain GSAP: `tl.fromTo(selector, from, to, T)`. Translate them
like this:

| In the HyperFrames file | In a `VM.scene` builder |
|---|---|
| `tl` (the composition timeline), time `T` in seconds | `ctx.tl`, `T = ctx.at('<beat>')` (scene-local, so voice-over retiming moves it) |
| `document.querySelector('#x')`, markup in the HTML | `ctx.add('div', { class: … }, parent)`; keep the element reference |
| `data-start` / `data-duration` / `class="clip"` / `data-track-index` | Leave these out. The storyboard places and hides scenes; one scene = one clip. |
| Pixel sizes (`font-size: 96px`, `x: 400`) | `calc(var(--u) * n)` in CSS, `ctx.u * n` in JS (1 u = 1 % of the short side) |
| `window.__timelines[...] = tl` | Leave it out. The runtime registers the master timeline. |
| An `onUpdate` proxy (counters, canvas) | Tween a state object and draw in `ctx.onFrame`, or use `VMX.counter` |
| Scene-to-scene transitions (`__OLD__`, `__NEW__`) | Register once with `VM.transition(name, fn)` or use a built-in; set it in `transition_in` |
| `repeat: -1`, CSS `@keyframes`, WAAPI, Anime.js, Lottie adapters | Not allowed in scene mode. Use a finite `repeat`, or GSAP. |
| Registry blocks (`hyperframes add …`) | Adapt the block's GSAP and markup into a scene, or use native mode. (A block-as-scene bridge is on the roadmap.) |

## Where to look (vendored paths are under `vendor/hyperframes/skills/`)

| Need | Read first (ours) | Then (HyperFrames) |
|---|---|---|
| Intake, story, pacing | `references/workflow.md` | `hyperframes-creative/references/story-spine.md`, `narration.md`, `storyboard-recipe.md`, `beat-direction.md` |
| Choosing a visual | `references/visual-catalog.md` | `hyperframes-animation/blueprints-index.md` (22 shot templates), `rules-index.md` (43 rules) |
| Motion feel, easing | `references/motion-design.md` | `hyperframes-creative/references/motion-principles.md`, `hyperframes-animation/adapters/gsap*.md` |
| Transitions | `references/motion-design.md` § transitions | `hyperframes-animation/transitions/overview.md`, `catalog.md`, `TRANSITION-REGISTRY.md` |
| Camera moves, zooms, paths, masks, SVG draw/morph | `references/composition-contract.md` | `hyperframes-keyframes/references/keyframe-patterns.md`, `hyperframes-animation/rules/viewport-change.md`, `svg-path-draw.md` |
| Charts and numbers | `references/visual-catalog.md` | `hyperframes-creative/references/data-in-motion.md`, `hyperframes-animation/rules/stat-bars-and-fills.md`, `counting-dynamic-scale.md`, `chart-scrub-readout.md` |
| Palette, fonts, design spec | `references/motion-design.md` § design | `hyperframes-creative/references/design-spec.md`, `typography.md`, `palettes/*.md`, `frame-presets/*/FRAME.md` |
| Narration and voice | `references/voiceover.md` | `media-use/audio/references/tts.md` (their providers; ours is `kokoro-tts`) |
| Captions | `references/voiceover.md` § captions | `media-use/audio/references/captions/*.md` |
| Music bed, SFX, ducking, loudness | `references/voiceover.md` § mix | `media-use/audio/references/bgm.md`, `sfx.md`, `media-use/references/operations.md`, `hyperframes-audio/SKILL.md` |
| Images, icons, logos, LUTs, grading | — | `media-use/SKILL.md`, `references/resolve.md` (catalog BGM/images need a HeyGen login), `grading.md` |
| Native composition contract | — | `hyperframes-core/SKILL.md`, `references/data-attributes.md`, `determinism-rules.md` |
| CLI flags (render, check, snapshot, Studio) | `references/rendering.md` | `hyperframes-cli/SKILL.md`, `references/preview-render.md`, `lint-validate-inspect.md` |
| Studio layout conventions | — | `hyperframes-studio/SKILL.md` |
| Registry blocks and components | — | `hyperframes-registry/SKILL.md`, `references/discovery.md` |

## What does not carry over

- **The umbrella's intake and routing** (`hyperframes/SKILL.md` §1–4, `BRIEF.md`,
  `npx hyperframes skills update <workflow>`): this skill replaces them. The workflow skills the
  umbrella names (`/faceless-explainer`, `/general-video` and so on) are not vendored.
- **Their TTS order** (HeyGen, then ElevenLabs, then CPU Kokoro): use `kokoro-tts`, the local GPU
  Kokoro, which also outputs word timings. `hyperframes tts` is only a fallback.
- **HeyGen-account features**: `media-use resolve` catalog BGM/SFX/images, `cloud render` and
  `publish` need a HeyGen login. Lambda and Cloud Run need cloud accounts. All of these are
  optional and never used without the user asking.
- **"Banned" fonts**: HyperFrames' typography guide bans Inter, among others, for its own
  house style. Our bundled defaults (Inter, JetBrains Mono, Source Serif 4) stay valid. Follow a
  design preset when you want its look.

## Parity check (after upgrading either side)

```bash
node engine/scripts/render.mjs examples/gradient-descent --out /tmp/vm.mp4
node engine/scripts/render.mjs examples/gradient-descent --engine hf --out /tmp/hf.mp4
ffmpeg -i /tmp/vm.mp4 -i /tmp/hf.mp4 -lavfi psnr -f null -     # expect average ≳ 35 dB
```
