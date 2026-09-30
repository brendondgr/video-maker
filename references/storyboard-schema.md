# storyboard.json

The single source of truth for **what** the video contains and **when**. The runtime reads it
directly: scene order, durations, transitions, canvas size and style tokens all come from here, so
the plan and the build cannot drift apart. Scene code reads its text and beat times from it too.

```jsonc
{
  "version": 1,
  "meta": {
    "title": "Gradient descent in 45 seconds",
    "slug": "gradient-descent",            // output file names
    "mode": "directed",                    // "directed" | "open"
    "audience": "newcomers to ML",
    "goal": "Viewer can explain how a model improves in one sentence.",
    "tone": "calm, precise",
    "sources": ["paper.pdf §3", "data/results.csv"],
    "render_height": 2160                  // optional hint (set by the 4k preset)
  },
  "canvas": {
    "width": 1920, "height": 1080,         // design size in CSS px; must be even
    "fps": 30,
    "background": "#f3ede2",               // optional; design.mjs sets it to palette.bg
    "safe_area": 0.05                      // fraction of each edge reserved (title-safe)
  },
  "target_duration": 50,                   // seconds; validator warns if the timeline misses by >10 % (min 2 s).
                                           // voiceover.mjs overwrites it with the fitted length; the requested
                                           // length is kept in meta.target_duration (plan.mjs reports it)
  "style": {
    "look":    { "name": "Terracotta paper", "mood": "warm, tactile, historical",   // the art direction, chosen per video
                 "why": "a history of pottery: fired clay, museum labels", "source": "custom" },   // shown in PLAN.md; design.mjs writes it
    "palette": { "bg": "…", "surface": "…", "ink": "…", "muted": "…", "line": "…",
                 "accent": "…", "accent-2": "…", "accent-3": "…", "warn": "…" },   // → CSS --c-<key>; bg, ink, accent required (Gate 1)
    "fonts":   { "sans": "'Inter Variable'", "display": "'Space Grotesk'", "mono": "'JetBrains Mono Variable'", "serif": "'Source Serif 4 Variable'" }, // → --f-<key>; display = headings (defaults to sans)
    "motion":  { "ease": "power3.out", "base": 0.7, "exit": 0.45, "presets": { /* optional overrides */ } },
    "roles":   { "gen": { "name": "Generation", "color": "#2f6f62", "icon": "bulb" } }   // recurring actors: one colour + icon each (VMX.kit, visual-playbook.md § 4)
  },
  "images": {                              // generated illustrations → images.mjs (see images.md)
    "backend": "codex", "size": "landscape",
    "style": "<one style key appended to every prompt: palette, medium, lighting, 'no text'>",
    "items": [ { "name": "hero", "prompt": "…" }, { "name": "cells", "prompt": "…", "backend": "comfy", "model": "z-image-turbo", "seed": 7 } ]
  },
  "audio": {                               // see voiceover.md
    "voiceover": { "enabled": true, "voice": "am_michael", "speed": 1.0, "retime": "fit",
                   "pad_before": 0.3, "pad_after": 0.5, "loudness": -16 },
    "captions": { "enabled": true, "style": "clean" },     // clean | karaoke | plain
    "music": null                          // or { "src": "assets/bed.mp3", "volume": 0.12, "duck": true }
  },
  "overlays": [],                          // whole-video layers registered with VM.overlay (captions are automatic)
  "rules": {                               // optional overrides of QA thresholds
    "max_words_per_second": 3.2,
    "min_scene_duration": 1.5,
    "max_scene_duration": 20,
    "duration_tolerance": 0.1,
    "min_text_px_ratio": 0.02              // min font size as a fraction of the short side
  },
  "assets": { "scripts": ["lib/loss.js"] },  // project scripts loaded before scene files
  "scenes": [
    {
      "id": "landscape",                   // lowercase; file is scenes/<id>.js unless "module" is set
      "duration": 7,                       // seconds this scene is on screen (including its transition-in)
      "purpose": "The loss is a landscape; each step walks downhill.",
      "on_screen_text": ["The loss landscape", "Each step walks downhill"],   // ctx.text[i]
      "narration": "Picture the error as a landscape…",   // spoken line → voiceover.mjs (kokoro-tts)
      "visual": { "type": "field", "notes": "Contours; dot follows descent path." },
      "data": { "any": "json" },           // ctx.data — small datasets live here or in lib/
      "beats": [ { "id": "field", "t": 0 }, { "id": "walk", "t": 1.2, "cue": "text:downhill" }, { "id": "label", "t": 4.6 } ],
      "sfx": [ { "name": "whoosh-short", "at": "walk", "offset": -0.15, "volume": 0.3 } ],  // bundled HF SFX or "src"
      "voice": { "pad_before": 0.3, "pad_after": 0.5 },   // optional per-scene pad overrides
      "hold": 0,                             // optional extra seconds after the narration
      "captions": true,                      // false hides captions on this scene
      "silent": { "duration": 7, "beats": { "walk": 1.2 } },   // written by voiceover.mjs: the pre-retime plan
      "transition_in": { "type": "blur-crossfade", "duration": 0.5, "ease": "power2.inOut" },  // + direction/color/blocks per type
      "background": "#000",                // optional per-scene background
      "assets": ["assets/figure3.png"],    // checked for existence
      "module": "scenes/shared-chart.js"   // optional: several scenes can share one file
    }
  ]
}
```

## Timing model

- Scenes play in order. A scene with `transition_in.duration = d` **starts d seconds before the
  previous scene ends** and animates in over it; the previous scene stays visible underneath until
  its own end. Total length = Σ durations − Σ transition overlaps.
- Scene-local time starts at 0 when the scene starts (i.e. when its transition begins).
- `beats[].t` are scene-local seconds. Scene code positions tweens with `ctx.at('<id>')`.
- With voice-over, `voiceover.mjs` owns `duration` and beat `t` (retime `fit`/`extend`): edit
  `narration`, `silent.duration`/`silent.beats`, pads and `cue`s, then re-run it. A beat `cue`
  (`"text:<phrase>"` or `"word:<n>"`, plus optional `offset`) lands on that spoken word.
- The last frame is `round(total × fps) − 1`; the runtime clamps seeks to `[0, total]`.

## Field reference

| Field | Required | Used by |
|---|---|---|
| `meta.title/slug/mode/goal` | recommended | validator, output names, hand-off |
| `canvas.*` | yes | runtime, renderer, checks |
| `style.*` | recommended | runtime → CSS variables |
| `style.roles` | when a video has recurring actors | `VMX.kit` (headers, chips, flows, lanes) |
| `images.*` | when the video uses illustrations | images.mjs, plan.mjs |
| `meta.target_duration` | recommended | plan.mjs (the requested length; `target_duration` becomes the fitted one) |
| `scenes[].id/duration/visual.type` | yes | everything |
| `scenes[].purpose` | recommended (warned) | editorial discipline |
| `scenes[].on_screen_text` | when the scene shows text | reading-speed check, `ctx.text` |
| `scenes[].beats` | recommended | `ctx.at`, snapshots, voice-over retiming |
| `scenes[].narration` | for narrated videos | voiceover.mjs, captions, Gate 1 pacing |
| `scenes[].beats[].cue` / `offset` | optional | voiceover.mjs retiming |
| `scenes[].sfx` | optional | voiceover.mjs mix |
| `audio.*`, `overlays` | optional | voiceover.mjs, runtime overlays, render/verify |
| `scenes[].transition_in` | optional (default cut) | runtime |

Visual types and transitions are listed in `engine/catalog.json`; unknown values are warnings, not
errors, so custom ones are allowed.
