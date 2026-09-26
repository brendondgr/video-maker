---
name: video-maker
description: Plan, build, validate and render motion-graphics videos (explainers, data stories, paper/concept summaries, promos) as deterministic HTML + GSAP compositions rendered frame-by-frame to MP4. Use whenever the user asks to make, animate or render a video, whether they give a detailed shot list ("directed") or just hand over documents and say "make a video from these" ("open"). Any length, resolution, aspect ratio or frame rate.
---

# video-maker

Videos are **code, not footage**. Each video is a small web page whose every visual is driven by
one paused GSAP timeline. The renderer seeks that timeline to `frame / fps`, screenshots the page
in headless Chromium, and pipes the frames to FFmpeg. Nothing depends on the wall clock, so the
same project always renders the same frames — which is what makes planning, validating and
iterating possible.

```
brief.md ──► storyboard.json ──► scenes/*.js ──► QA gates 1–4 ──► draft render ──► gate 5 ──► final render
 (what/why)   (the plan: scenes,   (one file per    (plan, lint,     (look at it)    (file facts,
              durations, beats)     scene)           runtime, eyes)                   black/frozen)
```

`SKILL_DIR` below means the directory containing this file. Scripts take the **project directory**
as their first argument.

## 0 · One-time setup

```bash
cd "$SKILL_DIR/engine" && npm install && npx playwright install chromium
node "$SKILL_DIR/engine/scripts/doctor.mjs"      # must print "All good."
```
Needs Node ≥ 18 and ffmpeg/ffprobe on PATH. If Playwright's browser download is blocked, pass
`--chrome /path/to/chrome` to any script (or set `VM_CHROME`).

## 1 · Intake — decide the mode, pin the spec

Classify the request (details and question bank: `references/workflow.md` §1):

| Mode | Signal | Behaviour |
|---|---|---|
| **directed** | The user specifies content, order, scenes, style or timing | Follow their instructions exactly. Fill only the gaps; never "improve" what they specified. Ask only about contradictions or missing essentials. |
| **open** | "Make a video from the attached documents" / a topic with no structure | You own the editorial decisions: read everything, find the story, choose visuals. State every assumption in the brief and the hand-off. |

Pin the technical spec, using these defaults when unstated (say which you assumed):

| Spec | Default | Notes |
|---|---|---|
| Length | open mode: 45–90 s; directed: as asked | Budget ≈ 1 scene per 4–7 s |
| Aspect / resolution | 16:9 1920×1080 | presets: `720p 1080p 1440p 4k vertical square portrait cinema` |
| FPS | 30 | 24 for a filmic feel, 60 only for fast motion/UI |
| Style | dark, clean, one accent colour | see `references/motion-design.md` |
| Audio | none (voice-over is a later phase — keep `narration` fields filled anyway) | |

If the user is present and a choice changes the whole video (audience, length, aspect, tone), ask
once with AskUserQuestion. If unattended, pick the default, record it, and continue.

## 2 · Scaffold and write the brief

```bash
node "$SKILL_DIR/engine/scripts/new-project.mjs" videos/<slug> --title "<Title>" --preset 1080p --duration 60 --mode open
```
Fill `brief.md` **before** storyboarding: request, sources digested, audience, goal (what the
viewer should know/feel/do at the end), ≤ 5 key messages, and an **evidence bank** — every number,
quote, equation, figure and diagram worth showing, each with its source. In open mode, read every
attached document fully first; the evidence bank is where accuracy is won or lost. Never invent
data — if a chart needs numbers the sources don't have, label it *illustrative* on screen.

## 3 · Storyboard — the plan is a file

Write `storyboard.json` (schema: `references/storyboard-schema.md`). Per scene: `id`, `duration`,
`purpose` (why it exists), `on_screen_text`, `visual.type` (from `engine/catalog.json`) + `notes`,
`beats` (named times inside the scene), `transition_in`, and `narration` (reserved for TTS).
Choose an arc from `references/workflow.md` §3 and visuals from `references/visual-catalog.md`.

```bash
node "$SKILL_DIR/engine/scripts/validate-storyboard.mjs" videos/<slug> --plan-only
```
Fix every error. Then **checkpoint**: show the user a compact scene table (id · seconds · purpose ·
visual) and wait for approval if they are present and the video is longer than ~60 s or the mode
is open; otherwise continue.

## 4 · Build — one file per scene

Each storyboard scene `id` maps to `scenes/<id>.js`:

```js
VM.scene('rates', {
  build(ctx) {                                // may be async (e.g. 3D)
    const box = ctx.add('div', { class: 'safe center stack' });
    const h = ctx.add('div', { class: 't-title', text: ctx.text[0] }, box);
    VMX.enter(ctx, h, { at: ctx.at('title'), preset: 'rise' });   // times come from storyboard beats
    VMX.lineChart(ctx, { series, at: ctx.at('chart') });
  }
});
```
Full API: `references/composition-contract.md`. The non-negotiable rules (the linter enforces them):

1. Every animation goes on `ctx.tl` (or a timeline added to it). No free `gsap.to`.
2. Anything computed per frame (canvas, WebGL, counters, text from numbers) is drawn in `ctx.onFrame(fn)`.
3. No `Math.random` (use `ctx.random()`), `Date.now`, timers, `requestAnimationFrame`, CSS animations/transitions, d3 transitions, live force simulations, or `repeat: -1`.
4. Positions come from `ctx.at('<beat>')`, not magic numbers — so a future voice-over pass can retime beats.
5. Size in `var(--u)` / `ctx.u` (1 % of the short side) and keep text inside `.safe`, so aspect changes don't break layout.
6. Vendor every asset into `assets/`; no network at render time.

Preview while building: `node "$SKILL_DIR/engine/scripts/preview.mjs" videos/<slug>` → open the
URL (scrubber, scene markers, `?scene=id`, `?t=12.5`).

## 5 · Validate — automated gates, then your eyes

```bash
node "$SKILL_DIR/engine/scripts/qa.mjs" videos/<slug>      # gates 1–4 → qa/report.md + qa/contact-sheet-*.png
```
Gate 1 storyboard · Gate 2 lint · Gate 3 runtime (errors, determinism, off-stage/clipped/tiny/
overlapping/low-contrast text, reading speed, blank frames) · Gate 4 contact sheets.
**Then Read every contact sheet image** and score it with the visual rubric in
`references/validation.md` — the gates catch mechanics; only looking catches a chart that says the
wrong thing, a cramped layout, or a 3D camera pointing at nothing. Use
`snapshot.mjs <project> --scene <id>` or `--times a,b,c` to inspect specific moments. Fix → re-run
`qa.mjs` until it passes with no unexplained warnings and the rubric has no ✗. Cap at ~4 loops;
if something still fails, say so plainly.

## 6 · Render and verify

```bash
node "$SKILL_DIR/engine/scripts/render.mjs" videos/<slug> --quality draft          # fast 720p check
node "$SKILL_DIR/engine/scripts/verify-output.mjs" videos/<slug> videos/<slug>/out/<file>.mp4
node "$SKILL_DIR/engine/scripts/render.mjs" videos/<slug> --quality high [--height 2160] [--fps 60]
```
Useful flags: `--scene id` or `--from/--to` for partial renders, `--workers N`, `--format webm|png`,
`--codec h265`, `--audio file` (muxes a track — the hook the TTS phase will use). Details and
performance notes: `references/rendering.md`. Gate 5 (`verify-output.mjs`) checks resolution, fps,
frame count, black gaps and frozen stretches. Extract and look at 2–3 frames from the final file.

## 7 · Deliver

Hand over: the final MP4 (in the user's folder if one is connected), a poster frame, and a short
note with length/resolution, the scene list, assumptions made, anything *illustrative*, and any QA
warnings you chose to accept (with why). Keep the project folder — it is the editable source.

## Extending the skill

It is deliberately open-ended; add rather than fork.
- **New visual pattern** → write a helper in `engine/runtime/helpers/` (register on `VM.helpers`,
  add it to `boot.js`), add the type to `engine/catalog.json`, document it in `references/visual-catalog.md`.
- **New transition** → `VM.transition('name', (tl, el, at, dur, ease) => …)` in a project script, or in `vm.js`.
- **Project-specific code** → `lib/*.js` listed in `storyboard.assets.scripts` (loaded before scenes).
- **House style** → a `style` block (palette, fonts, motion presets) reused across storyboards.
- **Voice-over (planned)** → see `references/voiceover-roadmap.md`; the storyboard already carries
  `narration`, `audio.voiceover` and beat ids for it.

## Reference map

| File | Read when |
|---|---|
| `references/workflow.md` | Every video: intake questions, research/digest, arcs, pacing budgets, long-form structure |
| `references/storyboard-schema.md` | Writing or editing storyboard.json |
| `references/composition-contract.md` | Writing scene code: `ctx`, `VMX.*` helpers, styling, 3D, assets |
| `references/visual-catalog.md` | Choosing how to show each idea; library rationale (from viz-bench) |
| `references/motion-design.md` | Timing, easing, typography, colour, layout, what makes it look professional |
| `references/validation.md` | Gates, the visual review rubric, common failures and fixes |
| `references/rendering.md` | Render flags, presets, performance, troubleshooting |
| `references/voiceover-roadmap.md` | Planning the TTS phase |
| `examples/gradient-descent/` | A complete, passing 50 s project exercising most helpers |
