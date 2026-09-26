# Composition contract & API

## Project layout

```
videos/<slug>/
  index.html        boilerplate — import map + vm.css + style.css + boot.js (rarely edited)
  storyboard.json   the plan (see storyboard-schema.md)
  brief.md          intake + evidence bank
  style.css         project classes (sizes in var(--u); no CSS animation)
  scenes/<id>.js    one builder per storyboard scene
  lib/*.js          shared code/data, listed in storyboard.assets.scripts
  assets/           images, fonts, data, GeoJSON — everything local
  qa/               reports, stills, contact sheets (generated)
  out/              renders (generated)
```

The dev/render server serves the project at `/` and the engine at `/_engine/`, so projects can
live anywhere on disk.

## Boot sequence

`boot.js` loads GSAP (+ SplitText, TextPlugin, DrawSVG, MorphSVG, MotionPath, CustomEase), D3,
KaTeX, rough.js, the runtime and helpers → `storyboard.assets.scripts` → each scene file → then
`VM.start()`: waits for fonts, runs every builder **in storyboard order**, pins each scene timeline
to its duration, places it on the master timeline, applies transitions, and exposes:

```js
window.__vm = { ready, duration, fps, width, height, frames, scenes:[{id,start,end,duration}],
                seek(t), warnings, errors, storyboard, timeline }
```
The renderer and checks only ever call `__vm.seek(t)`. `window.__timelines.main` also holds the
master timeline (HyperFrames-style) for external seek-based tools.

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

## Extending the runtime

- New helper: add `engine/runtime/helpers/<name>.js` (IIFE that attaches to `VM.helpers`), append it
  to `LIBS` in `boot.js`, document it here, add a catalog type if it's a new visual.
- New transition: `VM.transition('name', (masterTl, sceneEl, at, dur, ease) => { masterTl.fromTo(sceneEl, …, at) })`.
- Anything seekable works: GSAP-driven Lottie (`goToAndStop(frame, true)` in `onFrame`), canvas
  libraries, WebGL — as long as the picture is a pure function of time.
