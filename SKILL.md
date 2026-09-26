---
name: video-maker
description: Plan, narrate, illustrate, build, validate and render motion-graphics videos (explainers, paper/concept summaries, data stories, promos) as deterministic HTML + GSAP compositions, with step-by-step SVG diagrams timed to the narration, generated illustrations (bundled imagegen: Codex or local ComfyUI), local GPU text-to-speech (Kokoro), word-timed captions, sound effects and a mastered mix, rendered to 1080p/4K MP4 by either its own renderer or HyperFrames'. Includes the HyperFrames skills (motion rules, transitions, design presets, audio, media, CLI, Studio) as references. Use whenever the user asks to make, narrate, caption, animate or render a video, whether they give a shot list ("directed") or just hand over documents ("open"). Any length, aspect ratio or frame rate.
---

# video-maker

Videos are **code, not footage**. Each video is a small web page whose every visual is driven by
one paused GSAP timeline. A renderer seeks the timeline to `frame / fps`, captures the frame in
headless Chromium and encodes with FFmpeg. Nothing depends on the wall clock, so a project always
renders the same frames. That is what makes planning, retiming to a voice, checking and iterating
possible.

Every project is also a valid **[HyperFrames](references/hyperframes.md)** composition. That means
two renderers, two linters and the HyperFrames Studio editor all work on the same files, and the
ten vendored HyperFrames skills serve as reference libraries for motion, design, audio and media.

```
brief.md ─► storyboard.json ─► PLAN.md ─► images ─► voiceover ─► scenes/*.js ─► QA gates ─► render ─► verify ─► deliver
 (what/why)  (scenes, narration,  (shown to   (generated  (TTS → retime  (scene kit;     (lint, runtime,  (vm or hf  (file,     (~/Videos/…)
              beats, visuals,      the user)   illustr.,   → captions/    diagrams built  HF, eyes)        engine)   audio)
              images, roles)                   background)  mix)          on the words)
```

**How scenes look is standardised** (`references/visual-playbook.md`): each idea gets the right
medium. That means SVG diagrams built step by step with each step landing on the word that
names it, charts built in reading order, illustrative UI mock-ups, and generated illustrations
for scenes and metaphors. Frames are filled, never dead, and honest about their data. Apply the
playbook by default; the user doesn't have to ask.

`SKILL_DIR` means the directory containing this file. Scripts take the **project directory** as
their first argument and live in `$SKILL_DIR/engine/scripts/`.

## 0 · Setup (once per machine)

```bash
cd "$SKILL_DIR/engine" && npm install && npx playwright install chromium-headless-shell
bash "$SKILL_DIR/tts/install.sh"                   # narration: GPU/CPU auto-detected (Windows: tts\install.ps1)
node "$SKILL_DIR/engine/scripts/doctor.mjs" --tts  # ✖ must be fixed; ▲ = optional feature missing
```

Requirements:
- **Engine:** Node ≥ 18 (≥ 22 for HyperFrames), FFmpeg, Chromium.
- **Narration:** `kokoro-tts`, a single environment at `~/venvs/kokoro` with a launcher on PATH.
- **Illustrations (optional):** `jq`, `python3`, plus at least one backend: the Codex CLI
  (`codex login`) or a local ComfyUI (`comfyui start`, port 8199 or `COMFY_URL`).

Per-OS and per-GPU steps, for AMD ROCm, NVIDIA CUDA, Intel XPU, Apple MPS and CPU, are in
`references/install.md`.

## 1 · Intake: decide the mode, pin the spec

| Mode | Signal | Behaviour |
|---|---|---|
| **directed** | The user specifies content, order, scenes, style or timing | Follow their instructions exactly. Fill only the gaps. Ask only about contradictions or missing essentials. |
| **open** | "Make a video from these documents", or a topic with no structure | You own the editorial decisions: read everything, find the story, choose the visuals. State every assumption in the brief and in the hand-off. |

Pin the spec. When something is unstated, use the default below and say you assumed it:

| Spec | Default | Notes |
|---|---|---|
| Length | open: 45–90 s · directed: as asked | about one scene per 4–7 s; narration ≈ 2.3–2.5 words/s (30 s ≈ 65 words, 60 s ≈ 125, 3 min ≈ 370, 10 min ≈ 1,300); over ~5 min see `long-form.md` |
| Resolution | **1080p** (1920×1080) | the only other output is **4K** (`--4k`). Drafts keep full resolution. |
| Aspect / fps | 16:9 · 30 fps | presets: `1080p 4k vertical square portrait cinema` |
| Voice | narrated + captioned when `kokoro-tts` is installed | voice `af_heart` or `am_michael`, speed 1.0; silent if the user asks |
| Style | dark, clean, one accent · or a HyperFrames preset (`design.mjs --list`) | light editorial presets suit papers |
| Music | none | an optional bed from a user-supplied file (`audio.music.src`) |
| Delivery | the user's videos folder if known, else `out/` | pass `render.mjs --deliver <dir>` |

If the user is present and a choice changes the whole video (audience, length, aspect, tone,
voice), ask once with AskUserQuestion. If you're working unattended, use the defaults and record
them.

**Choose the authoring mode.** Use **scene mode** (this workflow) for anything planned scene by
scene. Use **native HyperFrames mode** only when the deliverable is footage editing, captions on
existing video, a beat-synced music edit, or an assembly of registry blocks. See
`references/hyperframes.md`. Native mode still uses the brief, QA, render and hand-off steps
below.

## 2 · Scaffold and write the brief

```bash
node "$SKILL_DIR/engine/scripts/new-project.mjs" videos/<slug> --title "<Title>" --duration 60 --mode open \
     --voice am_michael --captions [--design blue-professional]
```

Fill `brief.md` **before** storyboarding:
- the request and the sources digested;
- the audience and the goal (what the viewer should know, feel or do at the end);
- at most 5 key messages;
- an **evidence bank**: every number, quote, equation, figure and diagram worth showing, each with
  its source (file + page).
- **Assumptions made**: the look, voice, which values are approximate or illustrative, and which
  mock-ups are illustrative.

In open mode, read every document fully first; the evidence bank is where accuracy is won or
lost. Never invent data. If a chart needs numbers the sources lack, label it *illustrative* on
screen.

## 3 · Storyboard: narration first

Write `storyboard.json` (schema: `references/storyboard-schema.md`). For each scene:
- `id`, a planned `duration` and a `purpose`;
- **`narration`**: the spoken line. Write it for the ear and spell numbers the way they should be
  said.
- `on_screen_text`: short. Captions carry the words, so the screen carries the idea.
- `visual.type` (from `engine/catalog.json`) plus `notes`;
- `beats`: named moments. Add a **`cue: "text:<phrase>"`** so a beat lands on the word that
  motivates it.
- `transition_in`: pick **2–3 transition types for the whole video** and repeat them.
- optional `sfx` cues.

Also decide the **medium of every scene** (`visual-playbook.md` § 1: diagram, chart, UI mock-up,
illustration, kinetic type). Write the build order and the cue word of each step into
`visual.notes`. Declare recurring actors in `style.roles` and the illustrations in
`storyboard.images` (a shared style key plus one prompt per image, `references/images.md`). For
technical or long videos, write the narration in **speaker style** (`voiceover.md` § Speaker
style): open on a story, one metaphor per hard concept, a worked example per rule, and the
limitations at the end.

Choose an arc from `references/workflow.md` §3 and visuals from `references/visual-catalog.md`;
the HyperFrames blueprints and motion rules are listed there too.

```bash
node "$SKILL_DIR/engine/scripts/validate-storyboard.mjs" videos/<slug> --plan-only
```
Fix every error. Then write the plan and show it:

```bash
node "$SKILL_DIR/engine/scripts/plan.mjs" videos/<slug>       # → PLAN.md (overview, assets, scene table, per-scene details) + SCRIPT.md
```

**Checkpoint:** give the user `PLAN.md` and `SCRIPT.md`. Wait for approval if they're present
and the video is over ~60 s or the mode is open, unless they said to proceed without asking. Re-run
`plan.mjs` after the voice pass so both files carry the final timecodes, and deliver them with the
video.

## 3b · Illustrations (background)

```bash
node "$SKILL_DIR/engine/scripts/images.mjs" videos/<slug>     # run_in_background: true; don't poll
```

This generates every `storyboard.images` item through the bundled imagegen dispatcher
(`imagegen/`). Codex handles complex editorial scenes (3 at a time); local ComfyUI is free and fast
(one at a time). Each finished image becomes `assets/img/<name>.jpg`, sized to cover the canvas.
Unchanged prompts are skipped on the next run. When it finishes, **open
`qa/images-contact-sheet.png`**; the red frames show the canvas crop. Redo bad ones by changing
one prompt axis (`--only <name> --force`). Details: `references/images.md`.

## 4 · Design

Pick a look before building scenes, so layout is designed against real colours and fonts:

```bash
node "$SKILL_DIR/engine/scripts/design.mjs" --list                              # 13 HyperFrames frame presets
node "$SKILL_DIR/engine/scripts/design.mjs" videos/<slug> --preset blue-professional   # palette + fonts → storyboard.style
```

`design.mjs`:
- prints the colour mapping it chose; check it;
- downloads web fonts once into `assets/fonts/`;
- copies the preset's `design.md`, whose composition rules you should read.

To build a look by hand instead, set `storyboard.style` directly (`references/motion-design.md`).

## 5 · Build: one file per scene

Build every scene to `visual-playbook.md`, using the **scene kit** (`const K = VMX.kit`): image
backgrounds and panels, role headers, chapter cards, chips, cards, app mock-ups, step trackers,
and step-by-step diagrams and charts (`K.flow`, `K.lanes`, `K.clusters`, `K.rankList`, `K.trend`,
`K.dotPlot`, `K.funnel`, `K.imageCards`). The rules that matter most:
- every reveal lands on its word;
- nothing is too small;
- no dead frames (ghost the diagram, then light it up);
- label anything approximate or illustrative.

Videos over ~5 min: once voice and images are done, build chapters in parallel with sub-agents,
each in its own working copy with the brief from `templates/scene-brief.md`
(`references/long-form.md`).

Each scene `id` maps to `scenes/<id>.js`:

```js
VM.scene('agents', {
  build(ctx) {
    const title = ctx.add('div', { class: 't-title', text: ctx.text[0] }, ctx.add('div', { class: 'safe' }));
    VMX.enter(ctx, title, { at: ctx.at('title'), preset: 'rise' });
    const d = VMX.hubSpokes(ctx, { hub: 'Supervisor', spokes: ctx.data.agents, at: ctx.at('agents') });
    VMX.pulse(ctx, d.nodes[2], { at: ctx.at('ranking'), color: 'var(--c-accent)' });   // lands on the spoken word
  }
});
```

The full API is in `references/composition-contract.md`. It covers `ctx`, the `VMX.*` helpers
(motion, text, charts, science, 3D, figures), overlays and transitions. For motion technique,
take snippets from the vendored HyperFrames rules and translate them with the table in
`references/hyperframes.md`.

Rules the linter enforces:

1. Every animation goes on `ctx.tl`, or on a timeline added to it. No free-running `gsap.to`.
2. Anything computed per frame (canvas, WebGL, counters) is drawn in `ctx.onFrame(fn)`.
3. Not allowed: `Math.random` (use `ctx.random()`), `Date.now`, timers, `requestAnimationFrame`,
   CSS animations and transitions, WAAPI, d3 transitions, live force simulations,
   `repeat: -1`.
4. Times come from `ctx.at('<beat>')`, never from magic numbers, because the voice-over retimes
   beats.
5. Size in `var(--u)` / `ctx.u` (1 % of the short side) and keep text inside `.safe`. **With
   captions on, keep scene text out of the bottom ~16 % of the frame.**
6. Vendor every asset into `assets/`. Nothing may load from the network at render time.

Preview while building:
- `node "$SKILL_DIR/engine/scripts/preview.mjs" videos/<slug>` opens our scrubber (`?preview`,
  `?scene=id`, `?t=12.5`);
- `node "$SKILL_DIR/engine/scripts/hf.mjs" videos/<slug> preview` opens HyperFrames Studio.

## 6 · Voice: synthesize, retime, caption, mix

```bash
node "$SKILL_DIR/engine/scripts/voiceover.mjs" videos/<slug>         # --force, --voice, --speed, --no-retime
```

This one command does four things:
- **Synthesize.** Each scene's narration goes through `kokoro-tts` (local GPU). Clips are cached
  per line, so editing one line re-synthesizes one clip.
- **Retime.** Each scene becomes as long as its narration needs, plus the pads and the next
  transition. Cued beats snap to their words and other beats scale. The silent plan is kept in
  `scene.silent`, so you can re-run.
- **Caption.** It writes `audio/captions.{json,srt,vtt}`. When `audio.captions.enabled`, the
  captions overlay draws them from these files.
- **Mix.** It writes `audio/mix.wav`: the voice, an optional ducked music bed and the `sfx` cues,
  mastered to −16 LUFS / −1.5 dBTP.

Re-run it after any narration or timing edit. Scene code doesn't change, because it reads
`ctx.at()`. Read `audio/timing.json` and the SRT to check pacing: a scene with a long silent tail
or a rushed line gets rewritten, not padded. Details: `references/voiceover.md`.

## 7 · Validate: automated gates, then your eyes

```bash
node "$SKILL_DIR/engine/scripts/qa.mjs" videos/<slug>      # → qa/report.md + qa/contact-sheet-*.png
```

| Gate | Checks |
|---|---|
| 1 · storyboard | structure; reading load; narration that doesn't fit its scene (`NARRATION_CUT`); a stale mix |
| 2 · lint | the determinism rules |
| 3 · runtime | errors; determinism; text that is off-stage, clipped, tiny, overlapping or low-contrast; blank frames |
| 3b · HyperFrames check | the same page through HF's lint/layout/motion/contrast sweep (transition-window overlaps count as info) |
| 4 · snapshots | contact sheets |

**Then Read every contact sheet** and score it with the rubric in `references/validation.md` and
the explainer checklist in `visual-playbook.md` § 8. The
gates catch mechanics; only looking catches a chart that says the wrong thing, a cramped layout, a
caption covering a label, or a 3D camera pointing at nothing.
- To look at specific moments: `snapshot.mjs <project> --scene <id>` or `--times a,b,c`.
- Fix, then re-run `qa.mjs` until it passes with no unexplained warnings and the rubric has no ✗.
- Cap it at about 4 loops. If something still fails, say so plainly.

## 8 · Render and verify

```bash
node "$SKILL_DIR/engine/scripts/render.mjs" videos/<slug> --engine hf --quality draft     # fast full-res check
node "$SKILL_DIR/engine/scripts/verify-output.mjs" videos/<slug> videos/<slug>/out/<file>.mp4
node "$SKILL_DIR/engine/scripts/render.mjs" videos/<slug> --engine hf --quality high [--4k] --deliver <dir>
```

- **`--engine hf`** (HyperFrames: beginFrame capture, about 3× faster) and **`--engine vm`** (ours,
  the default) produce the same frames.
- **Use `vm`** for `--scene` / `--from --to` partial renders, `--codec h265` and PNG frames.
- **Use `hf`** for `--format mov|gif`, `--docker` or `--gpu`.
- **Audio:** `audio/mix.wav` is included automatically on both engines. `--no-audio` renders
  silent; `--audio f` overrides the mix.
- **`--deliver <dir>`** copies the MP4, its SRT/VTT and a poster frame.

Gate 5 (`verify-output.mjs`) checks resolution, fps, frame count, audio presence and length, and
black or frozen stretches. Extract and look at 2–3 frames from the final file. More detail:
`references/rendering.md`.

## 9 · Deliver

Hand over:
- the final MP4 in the delivery folder, plus the poster and the `.srt`;
- a short note: length, resolution, voice, the scene list, the assumptions made, anything
  *illustrative*, and any QA warnings you accepted, with why.

Keep the project folder: it is the editable source. Re-running `voiceover.mjs` and `render.mjs`
reproduces the video exactly.

## Extending the skill

Extend it by adding rather than forking.
- **New visual pattern:** add a helper in `engine/runtime/helpers/`, register it on `VM.helpers`,
  add it to `boot.js`, add its type to `engine/catalog.json` and document it in
  `references/visual-catalog.md`. Port from a HyperFrames rule when one exists, and name the
  source file in a comment.
- **New transition:** `VM.transition('name', (tl, inEl, at, dur, ease, outEl, spec) => …)` in
  `engine/runtime/transitions.js`, or in a project script.
- **Whole-video layer** (watermark, progress bar, chapter tag): `VM.overlay('name', { build(ctx,
  opts) })`, enabled with `storyboard.overlays`.
- **Project-specific code:** `lib/*.js` listed in `storyboard.assets.scripts`.
- **House style:** a `frame.md` spec applied with `design.mjs --spec`.
- **Upgrading HyperFrames:** `sync-hyperframes.mjs --version X`, plus `npm i -E hyperframes@X` in
  `engine/`, then the parity check in `references/hyperframes.md`.

## Reference map

| File | Read when |
|---|---|
| `references/workflow.md` | Every video: intake questions, digest, arcs, pacing and narration budgets, long-form structure |
| `references/storyboard-schema.md` | Writing or editing storyboard.json (scenes, beats and cues, audio, captions, sfx, overlays) |
| `references/composition-contract.md` | Writing scene code: `ctx`, `VMX.*`, overlays, transitions, styling, 3D, assets |
| `references/visual-playbook.md` | **Every video**: medium per idea, step-by-step builds on the words, sizes, colour roles, structure, speaker style visuals, data honesty, review checklist |
| `references/images.md` | Generated illustrations: planning, style key, prompts, backends, `images.mjs`, review, using images in scenes |
| `references/long-form.md` | Videos over ~5 min: word budgets, structure, parallel scene builds with sub-agents |
| `references/visual-catalog.md` | Choosing how to show each idea; HyperFrames blueprints and rules mapped to our helpers and the scene kit |
| `references/motion-design.md` | Timing, easing, transitions, typography, colour, layout, design presets |
| `references/voiceover.md` | Narration, voices, retiming, captions, SFX, music, loudness |
| `references/validation.md` | Gates, the visual rubric, common failures and fixes |
| `references/rendering.md` | Engines, render flags, 1080p/4K, delivery, performance, troubleshooting |
| `references/hyperframes.md` | The bridge, the two authoring modes, translating HF snippets, where each HF topic lives |
| `references/install.md` | Installing on Linux/macOS/Windows for each GPU type; TTS troubleshooting |
| `vendor/hyperframes/skills/*` | HyperFrames' own references (routed from `references/hyperframes.md`) |
| `imagegen/reference/*` | The image dispatcher's internals (spec, manifest, adding a backend) and prompt craft |
| `templates/scene-brief.md` | The brief given to each sub-agent in a parallel build |
| `examples/gradient-descent/` | A complete, passing project that exercises most helpers |
| `examples/web-request/` | A small narrated project using the scene kit, roles and generated illustrations |
