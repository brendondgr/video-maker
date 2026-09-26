# Validation

Automated gates catch mechanical failures; the visual review catches whether the video is any
good. Both are required. `qa.mjs` runs gates 1–4 (including 3b, HyperFrames' own check) and writes
`qa/report.md`. Gate 5 runs on the rendered file.

## Gate 1 — storyboard (`validate-storyboard.mjs`)

Errors: invalid JSON, odd/invalid canvas size, fps out of range, missing/duplicate ids, non-positive
durations, missing `visual.type`, beats outside the scene, duplicate beat ids, unreadable text
density (> 1.4 × the words/s limit), missing scene files or assets.
Warnings: missing meta goal/title/mode, missing purpose, unknown visual/transition types, very
short/long scenes, tight reading density, long transitions, orphan scene files, total length off
target, narration too dense when voice-over is enabled.
Voice (once `voiceover.mjs` has run): `NARRATION_CUT` (error) — a scene is shorter than its
narration needs (lead + clip + pad + next transition); `VOICE_STALE` — narration not synthesized;
`MIX` — `audio/mix.wav` missing or older than storyboard.json.

## Gate 2 — lint (`lint.mjs`)

Errors: `Math.random`, `Date.now`/`performance.now`/`new Date()`, timers/rAF, free `gsap.to/from/
fromTo`, d3 `.transition()`, `repeat: -1`, live force simulations, CSS `@keyframes`/`animation`,
scene file not calling `VM.scene('<id>')`.
Warnings: nested timelines (make sure they're added), tween callbacks / `.call()` (suppressed while
seeking), `<video>` playback, external URLs, animating `ctx.el`, single-backslash escapes in
strings (KaTeX `\;` silently becomes `;`), CSS transitions. Suppress a line deliberately with a
`// vm-lint-disable` comment.

## Gate 3 — runtime (`check.mjs`)

Boots the composition headless at 1× and samples each scene (3 evenly spaced points, a "settled"
point 0.7 s before its end, and 0.8 s after each beat).
- **Boot**: page errors, console errors, failed requests, network requests outside the project,
  builders missing/throwing, `onFrame` errors, scene timelines longer than their duration.
- **Determinism**: frames rendered after forward vs. backward seeks must match (tolerates
  rasteriser noise ≤ 0.05 % of pixels). A mismatch means state is leaking between frames —
  usually a value set in `onFrame` that depends on the previous frame, or a DOM change made
  outside the timeline.
- **Layout** (per text element, aggregated over samples): `OFFSTAGE` (error if persistent),
  `CLIPPED` by an overflow container (error), `UNSAFE` outside the safe area, `TINY_TEXT` below
  `rules.min_text_px_ratio`, `OVERLAP` of two text boxes, `CONTRAST` < 3:1 where the background
  is a flat colour.
- **Reading load** measured from text actually visible in each scene.
- **Blank** frames, and a per-frame timing estimate for the render.

## Gate 3b — HyperFrames check (`hf.mjs <p> check --json`)

The same page through HyperFrames' own sweep: its linter (composition contract, font-face,
transform conflicts), runtime errors, layout (`content_overlap`, `text_occluded`, `text_clipped`,
`canvas_content_at_edge`, caption-zone), motion and WCAG contrast. Findings are mapped to scenes;
overlap/occlusion inside a transition window is downgraded to info (two scenes share the frame
there by design). Skipped with `--no-hf` or when the CLI is not installed. Mark intentional
layering in scene code with `data-layout-allow-overlap` (or `-occlusion`, `-overflow`).

## Gate 4 — contact sheets (`snapshot.mjs`)

Stills at ~12/52/92 % of every scene plus each beat, labelled, tiled into
`qa/contact-sheet-N.png`. **Open every sheet with the Read tool and score it:**

### Visual review rubric (✓ / ~ / ✗ per scene)

Also run the explainer checklist in `visual-playbook.md` § 8 (too small, dead frames, reveals on
their words, overlaps in settled frames, over-broad claims, missing "illustrative" labels,
unfinished counters, the caption band).


1. **Message** — could someone state the scene's `purpose` from the settled frame alone?
2. **Accuracy** — numbers, labels, units, equations and axes match the evidence bank; illustrative data labelled.
3. **Focal point** — one obvious thing to look at; hierarchy clear in < 1 s.
4. **Legibility** — text size comfortable at the delivery size (imagine it on a phone for social); contrast fine.
5. **Composition** — balanced, aligned, inside the safe area, nothing cramped or colliding, no big accidental voids.
6. **Motion story** — the 12 % → 52 % → 92 % progression shows a build, not a static card; entrances finished by the settled frame.
7. **Consistency** — palette, type, and motion vocabulary match the rest of the video.
8. **Transitions** — mid-transition frames don't show two unrelated texts overlapping illegibly.
9. **3D/fields** — camera frames the subject; nothing clipped by the frame edge; colours read.
10. **Captions** — cards sit in the caption zone without covering labels or chart marks; each card is a readable phrase (no orphan words); on-screen text doesn't duplicate the caption word for word.
11. **Voice sync** (read `audio/timing.json` / the SRT) — cued reveals land on their words; no scene has a long dead tail or starts talking before its transition finishes.

Any ✗ → fix and re-run. Inspect a problem closely with `snapshot.mjs <p> --scene <id>` (6 stills)
or `--times 12.3,12.6`. Record accepted "~" items in the hand-off.

## Gate 5 — output (`verify-output.mjs`)

ffprobe: resolution/aspect, fps, frame count vs. storyboard (skipped with `--partial`), pixel format,
audio stream if voice-over is enabled, audio length vs. timeline (`AUDIO_LENGTH`, ±0.1 s). ffmpeg `blackdetect` (unintended black gaps) and
`freezedetect` (≥ 4 s without motion). Afterwards extract 2–3 frames from the final file and look
at them — encoding problems (banding, blockiness) only show in the actual file.

## Common failures → fixes

| Symptom | Cause | Fix |
|---|---|---|
| Element jumps/flickers when scrubbing backwards | `gsap.set` or style change inside the timeline region without a matching tween; or `onFrame` accumulating state | Make `onFrame` a pure function of tweened values; use `fromTo` |
| Annotation circle in the wrong place | measured while element sat in its entrance offset | `VMX.layoutBox(ctx, el)` / `VMX.circle` (already transform-safe) |
| KaTeX shows `;` or `,` literally | single backslash in a JS string | double it: `'\\;'` |
| Text looks fine at 16:9, overflows at 9:16 | fixed px widths / no wrapping | sizes in `u`, `.row` wraps, `max-width` in % |
| Numbers shown mid-count on the previous scene's transition | counter visible before it starts | `enter` the counter at its start beat |
| 3D surface clipped or tiny | camera distance/fov/lookAt | adjust `camera`, `fov`, `orbit.distance`; check with `--scene` stills |
| "Frozen" warning | long hold with no motion | `VMX.drift`, stagger builds later, or shorten the scene |
| Caption covers a label | scene text in the caption zone (bottom ~16 %) | move it up, or `"captions": false` on that scene |
| Reveal lands before/after its word | beat not cued, or cue phrase not in the narration | `cue: "text:<phrase>"` and re-run `voiceover.mjs` (check its CUE warnings) |
| Render is slow | heavy canvas/WebGL recomputed every frame | cache on unchanged inputs (see `field`), lower `res`/`segments`, more `--workers` |
| First frame missing an image | image not decoded before first seek | `await img.decode()` in an async builder |
