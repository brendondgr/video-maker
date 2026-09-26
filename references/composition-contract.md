# Composition contract & API

## Project layout

```
videos/<slug>/
  index.html        boilerplate — import map + fonts.css + vm.css + style.css + boot.js; the
                    HyperFrames root <div id="stage" data-composition-id="main" …> (attributes and
                    the <audio id="vm-mix"> clip are synced from storyboard.json by the scripts)
  storyboard.json   the plan (see storyboard-schema.md)
  brief.md          intake + evidence bank
  design.md         (optional) the applied design preset's spec — composition rules to follow
  _engine           link to the engine (created by the scripts; git-ignored)
  audio/            voiceover.mjs output: vo/ clips, timing.json, captions.*, voiceover.wav, mix.wav
  style.css         project classes (sizes in var(--u); no CSS animation)
  scenes/<id>.js    one builder per storyboard scene
  lib/*.js          shared code/data, listed in storyboard.assets.scripts
  assets/           images, fonts, data, GeoJSON — everything local
  qa/               reports, stills, contact sheets (generated)
  out/              renders (generated)
```

All engine paths are relative (`./_engine/…`), so the project renders under our server (engine at
`/_engine/`), HyperFrames' server (through the `_engine` link) or any static server. Projects can
live anywhere on disk.

## Boot sequence

`boot.js` loads GSAP (+ SplitText, TextPlugin, DrawSVG, MorphSVG, MotionPath, CustomEase), D3,
KaTeX, rough.js, the runtime, `transitions.js` and the helpers → `storyboard.assets.scripts` → each
scene file → `audio/captions.json` (if captions are on) → `VM.start()`: waits for fonts, runs
every builder **in storyboard order**, pins each scene timeline to its duration, places it on the
master timeline, applies transitions, builds overlays (captions, `storyboard.overlays`), and
exposes:

```js
window.__vm = { ready, duration, fps, width, height, frames, scenes:[{id,start,end,duration}],
                seek(t), warnings, errors, storyboard, timeline }
```
Our renderer and checks call `__vm.seek(t)`. `window.__timelines.main` holds the same master
timeline for HyperFrames, whose adapter seeks GSAP directly; scene visibility and `onFrame` run
from the master's `onUpdate`, so both paths produce identical frames. Render mode is the default;
our scrubber UI mounts only with `?preview`.

## Scene builder

```js
VM.scene('<id>', {
  build(ctx) { … }          // or: async build(ctx) { … } (awaited before the next scene builds)
});
```

### `ctx`

| Member | Meaning |
|---|---|
| `ctx.el` | the scene's `<section>` (absolute, full-frame). **Don't animate it** — transitions do. Animate children. |
| `ctx.tl` | the scene's GSAP timeline; time 0 = scene start. Put every tween here. |
| `ctx.duration`, `ctx.start` | scene length; its start on the master timeline |
| `ctx.at(beat, fallback?)` | scene-local time of a storyboard beat (by id or index) |
| `ctx.text[i]`, `ctx.data`, `ctx.spec` | `on_screen_text`, `data`, the full scene object |
| `ctx.width/height/fps/u/portrait` | canvas facts; `u` = 1 % of the short side in px |
| `ctx.palette`, `ctx.style`, `ctx.storyboard` | tokens and the whole storyboard |
| `ctx.random()` | seeded PRNG (per scene id) |
| `ctx.onFrame(fn(localT, globalT))` | runs after every seek while the scene is visible — draw canvas/WebGL, set computed text |
| `ctx.add(tag, attrs, parent?)` | create an element (attrs: `class`, `text`, `html`, `style` object, any attribute) |
| `ctx.svg(attrs?)` | full-frame `<svg>` with a viewBox in canvas px |
| `ctx.canvas({width,height,parent})` | HiDPI canvas → `{ el, g, width, height }` |
| `ctx.import('three')` | ES module via the import map |

### Patterns

**Tween a number, draw from it** (the core pattern for anything not a CSS/SVG property):
```js
const s = { k: 0 };
ctx.tl.to(s, { k: 1, duration: 2, ease: 'power2.inOut' }, ctx.at('grow'));
ctx.onFrame(() => draw(s.k));
```
**Nested timeline**: `const sub = gsap.timeline(); sub.to(…); ctx.tl.add(sub, ctx.at('x'));`
**Hold then exit**: `VMX.exit(ctx, box)` defaults to finishing just before the scene ends.
**Measuring layout**: builders run after fonts load. Entrance helpers put elements in their
from-state immediately, so use `VMX.layoutBox(ctx, el)` (ignores transforms) to place annotations.

## Helpers — `VMX.*`

Motion (`helpers/motion.js`)
- `enter(ctx, targets, { at, preset, stagger, duration, ease, from, to })` — presets: `fade rise drop slide-left slide-right pop blur grow grow-y mask`
- `exit(ctx, targets, { at?, preset, duration })` · `hold(ctx, d)` · `drift(ctx, target, { from, to })`
- `motion.define(name, { from, to, ease })` — add presets; `storyboard.style.motion.presets` overrides

Text (`helpers/text.js`)
- `reveal(ctx, el, { at, by: 'words'|'lines'|'chars', preset: 'rise'|'mask-up'|'fade'|'blur'|'pop', stagger })` (SplitText)
- `typeOn(ctx, el, text, { at, cps, cursor })` · `highlight(ctx, el, { at, color, thickness })` · `swap(ctx, el, words, { at: [..] })`

Data (`helpers/data.js`)
- `counter(ctx, el, { from, to, at, duration, format: ',.0f' | fn, prefix, suffix })`
- `barChart(ctx, { data:[{label,value,color?}], rect:{x,y,w,h}, horizontal, highlight, format, suffix, at, stagger })`
- `lineChart(ctx, { series:[{name,points,color,dashed,area}], rect, x:{label,domain,ticks,format,log}, y:{…}, at, duration, seriesStagger, curve })`
- `tracer(ctx, chart, seriesIndex, { at, duration, fromP, toP })` — dot riding a series
- `axis(ctx, g, scale, { orient, ticks, format, grid })` · `draw(ctx, path, { at, duration })` · `arrow(ctx, svg, { x1,y1,x2,y2, bend, color, at, duration })`
- `color(i)`, `cssVar(name)`

Science & media (`helpers/science.js`)
- `tex(el, latex, { display })` · `texSteps(ctx, container, [latex…], { at, gap })`
- `field(ctx, { fn(x,y,p), domain:{x,y}, rect, res, thresholds, interpolator, range })` → `{ state, toPixel }` (tween `state.p` to morph)
- `network(ctx, { nodes, links, rect, at, stagger, nodeRadius, labelSize })` — layout precomputed, seeded
- `sketch(ctx, svg)` → rough.js generator · `circle(ctx, elOrBox, { at, color, pad })`
- `kenBurns(ctx, img, { from, to })` · `layoutBox(ctx, el)`

Figures (`helpers/figures.js`, adapted from HyperFrames motion rules)
- `hubSpokes(ctx, { hub, spokes:[…], cx, cy, radius, at, stagger, startAngle, linkColor })` → `{ hub, nodes, links, point(i) }`
- `cycle(ctx, { labels:[…], cx, cy, radius, at, stagger, color, gap })` → `{ nodes, arrows }` — stages on a ring with curved arrows
- `camera(ctx, wrap, [{ at, duration, focus:[x,y] | element, scale, ease }, …])` — pan/zoom a full-frame wrapper so `focus` is centred
- `ring(ctx, parent, { value, max, at, duration, size, color, label, format, suffix })` — progress ring + counter
- `pulse(ctx, el, { at, scale, color })` — one emphasis beat (pair with a narration `cue`)
- `.vm-node` (diagram chip) is centred on its point with GSAP `xPercent/yPercent` — don't add CSS transforms to it

3D (`helpers/three.js`) — build must be `async`
- `await scene3d(ctx, { camera:[x,y,z], lookAt, fov, background })` → `{ THREE, scene, camera, orbit, onFrame }`; tween `orbit.angle/elevation/distance`
- `surface(THREE, (x, z, p) => y, { size, segments, range, colormap })` → `{ mesh, update(p) }`

## Styling

`vm.css` supplies tokens (`--c-*`, `--f-*`, `--u`, `--safe`), layout utilities (`.safe .center
.stack .row .card .pill`) and a type scale (`.t-hero .t-display .t-title .t-head .t-body .t-small
.t-label`, plus `.t-mono .t-serif .muted .accent .accent-2 .accent-3 .tabular`). Put project
classes in `style.css`. Text that intentionally bleeds outside the safe area: add
`data-allow-unsafe` to it.

## Assets

- Images: `ctx.add('img', { src: 'assets/fig.png' })`, then `await img.decode()` in an async
  builder so the first frame never captures a half-loaded image.
- Fonts: drop `.woff2` into `assets/fonts/`, declare `@font-face` in `style.css`, reference it in
  `storyboard.style.fonts`.
- Video clips: not frame-synced by the browser. Either extract to an image sequence
  (`ffmpeg -i clip.mp4 assets/clip/%04d.jpg`) and swap `src` in `onFrame`, or set
  `video.currentTime = localT` in `onFrame` and accept slower renders.
- Maps: vendor GeoJSON/TopoJSON into `assets/`, `await fetch()` it in an async builder, draw with `d3.geoPath`.

## Overlays (whole-video layers)

```js
VM.overlay('progress', { build(ctx, opts) {        // ctx.tl spans the whole video (time 0 = video start)
  const bar = ctx.add('div', { class: 'my-progress' });
  ctx.tl.fromTo(bar, { scaleX: 0 }, { scaleX: 1, duration: ctx.duration, ease: 'none', transformOrigin: '0 50%' }, 0);
} });
```
Enable with `"overlays": ["progress"]` (or `{ "name": "progress", …options }`) in storyboard.json.
Overlays sit above every scene (z ≥ 1000). The built-in `captions` overlay is enabled by
`audio.captions.enabled` and fed `audio/captions.json`.

## Transitions

`VM.transition(name, (tl, inEl, at, dur, ease, outEl, spec) => { … })`: `tl` is the master
timeline, `inEl`/`outEl` the incoming/outgoing scene sections, `at` the moment the incoming scene
starts (it overlaps the outgoing one by `dur`), `spec` the storyboard `transition_in` object (for
options such as `direction`, `color`). Use `fromTo` with explicit start values and
`immediateRender: false`; put any cover layer in `inEl.parentNode` and hide it outside
`[at, at+dur]`. See `engine/runtime/transitions.js` and the table in `motion-design.md`.

## Extending the runtime

- New helper: add `engine/runtime/helpers/<name>.js` (IIFE that attaches to `VM.helpers`), append it
  to `LIBS` in `boot.js`, document it here, add a catalog type if it's a new visual. Porting a
  HyperFrames rule: keep its GSAP, swap selectors for element refs and `T` for `ctx.at()`, and name
  the source file in a comment (Apache-2.0 attribution).
- New transition or overlay: see the two sections above.
- Anything seekable works: GSAP-driven Lottie (`goToAndStop(frame, true)` in `onFrame`), canvas
  libraries, WebGL — as long as the picture is a pure function of time.
