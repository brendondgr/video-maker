# Visual catalog — how to show each kind of idea

Pick the visual that shows the idea most **directly**; text is the fallback. The types below match
`engine/catalog.json` (the validator checks `visual.type` against it).

Start with `visual-playbook.md` § 1 (diagram vs chart vs UI mock-up vs generated illustration).
The scene kit (`VMX.kit`) covers the common explainer parts listed at the end of this file.

## Content → visual

| The idea is… | Type | Build with | Notes |
|---|---|---|---|
| A question, a title, a chapter | `kinetic-title` | `reveal` by words/lines, `enter` | ≤ 8 words. One accent word. |
| One claim / takeaway | `statement` | `reveal`, `highlight`, `swap` | Highlight the 1–3 words that carry it. |
| 2–4 parallel points | `bullet-build` | `enter` with stagger, one at a time | Dim earlier points when a new one arrives. Never 5+. |
| A headline number | `stat` | `counter` + caption | Round to what matters (175 B, not 174,592,…). Unit and context under it. |
| Compare magnitudes | `bar-chart` | `barChart` | ≤ 8 bars, sorted unless order is meaningful, highlight the one that matters. |
| A trend / convergence | `line-chart` | `lineChart`, `tracer` | ≤ 4 series; label lines directly (no legend box); draw series in sequence. |
| A vs B | `comparison` | two columns + `enter`/`counter` | Same scale on both sides. |
| A process / architecture | `diagram` | cards + `arrow`/`draw` | Reveal in reading order; loop-backs as curved arrows in a second colour. |
| A coordinator and its parts (orchestrator + agents, hub + services) | `diagram` | `hubSpokes`, `pulse` | ≤ 8 spokes; pulse each spoke on the word that names it. |
| A repeating loop (generate → critique → refine) | `diagram` | `cycle` | 3–6 stages; the arrows draw in order, so narration can walk the loop. |
| A score, share or progress | `stat` | `ring` (or `barChart` for several) | One ring per idea; the number counts up with the arc. |
| Zooming into part of a big diagram | `diagram` | `camera` on a wrapper | Establish the whole first, then move; ≤ 2 moves per scene. |
| Events in time | `timeline` | axis line `draw` + `enter` markers | Camera pan (translate a wrapper) for long timelines. |
| Relations between things | `network` | `network` | ≤ 15 nodes on screen; highlight a path rather than showing everything. |
| A formula / derivation | `equation` | `tex`, `texSteps`, `circle` | Build in pieces so you can point at terms; label terms in words. |
| A function over 2D | `field` | `field` (d3-contour → canvas) | Tween `state.p` to morph; overlay paths in SVG via `toPixel`. |
| Something with depth | `surface-3d` | `scene3d`, `surface` | Slow orbit (< 1 rad over the scene). Keep a 2D title outside the mesh. |
| Code | `code` | `typeOn` or line-by-line `enter`, highlight bar | ≤ 12 lines, ≥ 2.4u font. |
| A quotation | `quote` | `reveal` by lines, serif | Attribution fades in after. |
| A figure/photo from the sources | `image` | `kenBurns`, `circle` | Crop to the part that matters; annotate rather than letting it sit. |
| Emphasis on top of anything | `annotation` | `circle`, `sketch`, `arrow` | Hand-drawn = "look here". Use sparingly. |
| Geography | `map` | d3-geo + `draw` | Local GeoJSON; animate the route/region, not the whole map. |
| Summary / CTA / credits | `outro` | `reveal`, `enter` | Restate the goal line from the brief. |

## HyperFrames blueprints and rules → our helpers

`vendor/hyperframes/skills/hyperframes-animation/` holds 22 multi-phase shot **blueprints**
(`blueprints-index.md`) and 43 atomic **rules** (`rules-index.md`), all plain GSAP. Read the
blueprint for structure and timing, then build it with our helpers (translation table in
`references/hyperframes.md`):

| HF blueprint / rule | Use it for | Build with |
|---|---|---|
| `kinetic-type-beats`, `titlecard-reveal` | hooks, chapter cards | `kinetic-title`: `reveal`, `enter` |
| `constellation-hub`, rule `avatar-cloud-network` | a system and its parts | `hubSpokes`, `network` |
| `agent-progress-theater` | agents/steps working in turn | `hubSpokes` + `pulse` per step, or `bullet-build` |
| `dataviz-countup`, rules `counting-dynamic-scale`, `stat-bars-and-fills` | headline numbers | `stat`: `counter`, `ring`, `barChart` |
| rule `chart-scrub-readout` | reading values along a curve | `lineChart` + `tracer` |
| `comparison-split` | A vs B | `comparison` |
| `spatial-pan-stations`, `camera-journey`, rules `viewport-change`, `coordinate-target-zoom` | moving through one large diagram | `camera` on a wrapper |
| rule `svg-path-draw` | lines, routes, arrows | `draw`, `arrow` |
| rule `css-marker-patterns` | highlight/underline/circle emphasis | `highlight`, `circle`, `sketch` |
| rule `asr-keyword-glow` | emphasis synced to speech | beat `cue` + `pulse` |
| `typewriter-reveal`, `prompt-type-submit-generate` | prompts, code, a research goal being typed | `typeOn` |
| `grid-card-assemble` | a set of items/examples | `bullet-build` in a grid, `enter` with stagger |

Product-launch blueprints (`cursor-ui-demo`, `device-surface-showcase`, `cta-morph-press`,
`panel-edit-live-sync`, `ticker-takeover`) rarely suit explainers.

## Why these libraries (from the viz-bench survey)

The engine follows the viz-bench verdict, re-weighted for **rendered video** instead of
interactive dashboards:

| Layer | Library | Role here | Why |
|---|---|---|---|
| Timeline | **GSAP 3.15** (+ SplitText, DrawSVG, MorphSVG, MotionPath — all free since 3.13) | every change over time | Nested, seekable, retimeable timelines; tweens plain objects so real geometry recomputes; animates SVG `d`. This is what makes frame-exact seeking possible. |
| 2D primitives | **D3 7.9** | scales, axes, shapes, formats, `d3.contours`, `d3-force` (precomputed), `d3-geo` | Used as a toolbox drawing to SVG/canvas, never as a transition engine. |
| 3D | **Three.js r186** | surfaces, solids, point clouds | ESM via import map; rendered in `onFrame` with `preserveDrawingBuffer`. |
| Math type | **KaTeX 0.18** | equations | Synchronous — layout is known immediately, which timelines need. |
| Sketch | **rough.js** | hand-drawn emphasis | Seeded, so strokes are identical every frame. |

Deliberately **not** used, with reasons carried over from viz-bench and adjusted for video:
- **JSXGraph** — the right pick for *interactive* constructions (drag a point, watch dependents
  follow). In a video nothing is dragged, so its dependency graph buys little over "tween a number,
  recompute geometry in `onFrame`". Use it only if a construction is much easier to express as
  constraints; drive its points from a tweened proxy and call `board.update()` in `onFrame`.
- **uPlot / Observable Plot / Plotly / ECharts** — built for interaction or one-shot rendering;
  none expose a seekable animation model, and Plot rebuilds its SVG on every call. D3 + GSAP gives
  finer control of the build-up.
- **d3 transitions, CSS animations, anime.js loops, Motion** — wall-clock driven; break determinism in scene
  mode. (HyperFrames' native mode has seek adapters for CSS/WAAPI/Anime.js/Lottie; use those only there.)
- **Lottie** — only if you have pre-authored files; drive it with `goToAndStop` in `onFrame`.
- **Motion Canvas / Revideo / Remotion / Manim** — excellent video-as-code tools with their own
  runtimes. This skill keeps the web page as the medium so the viz-bench library knowledge,
  plain HTML/CSS, and agent-friendly editing carry over. Precomputing heavy scenes in Python
  (Manim, PyVista, Matplotlib → image sequences in `assets/`) is fine and fits the "Python in the
  authoring pipeline, never at runtime" principle.

## Choosing among close options

- Numbers the viewer should **remember** → `stat`; numbers the viewer should **compare** → `bar-chart`; numbers that **change over something ordered** → `line-chart`.
- More than ~20 data points of scattered data → canvas, not SVG.
- A diagram with > 7 boxes → split across two scenes or zoom (scale a wrapper) between halves.
- If a visual needs a paragraph to explain, the visual is wrong.

## Scene kit equivalents (`VMX.kit`)

| Idea | Kit part |
|---|---|
| a process or pipeline, built step by step | `K.flow` (with `ghost: true` for a long intro line) |
| parallel work, throughput, "more workers" | `K.lanes` |
| grouping, similarity, de-duplication | `K.clusters` |
| a ranking that changes | `K.rankList` + `.move` |
| a trend with a live value, baselines to beat, "no plateau" | `K.trend` (`refs`, `readout`, `at.extend`) |
| scores where lower is better | `K.dotPlot` |
| a selection or filtering process | `K.funnel` |
| examples or case studies with pictures | `K.imageCards` |
| how to use a tool | `K.app` + `K.field` + `K.button`/`K.press` + `K.tracker` |
| chapter openers | `K.chapterScene` over an illustration |

