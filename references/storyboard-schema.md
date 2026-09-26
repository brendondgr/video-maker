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
    "background": "#0b0f17",
    "safe_area": 0.05                      // fraction of each edge reserved (title-safe)
  },
  "target_duration": 50,                   // seconds; validator warns if the timeline misses by >10 % (min 2 s)
  "style": {
    "palette": { "bg": "…", "surface": "…", "ink": "…", "muted": "…", "line": "…",
                 "accent": "…", "accent-2": "…", "accent-3": "…", "warn": "…" },   // → CSS --c-<key>
    "fonts":   { "sans": "'Inter Variable'", "mono": "'JetBrains Mono Variable'", "serif": "'Source Serif 4 Variable'" }, // → --f-<key>
    "motion":  { "ease": "power3.out", "base": 0.7, "exit": 0.45, "presets": { /* optional overrides */ } }
  },
  "audio": {
    "voiceover": { "enabled": false },     // TTS phase: provider, voice, timing file…
    "music": null
  },
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
      "narration": "Picture the error as a landscape…",   // reserved for TTS; used for pacing checks when enabled
      "visual": { "type": "field", "notes": "Contours; dot follows descent path." },
      "data": { "any": "json" },           // ctx.data — small datasets live here or in lib/
      "beats": [ { "id": "field", "t": 0 }, { "id": "walk", "t": 1.2 }, { "id": "label", "t": 4.6 } ],
      "transition_in": { "type": "fade", "duration": 0.5, "ease": "power2.inOut" },
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
- The last frame is `round(total × fps) − 1`; the runtime clamps seeks to `[0, total]`.

## Field reference

| Field | Required | Used by |
|---|---|---|
| `meta.title/slug/mode/goal` | recommended | validator, output names, hand-off |
| `canvas.*` | yes | runtime, renderer, checks |
| `style.*` | recommended | runtime → CSS variables |
| `scenes[].id/duration/visual.type` | yes | everything |
| `scenes[].purpose` | recommended (warned) | editorial discipline |
| `scenes[].on_screen_text` | when the scene shows text | reading-speed check, `ctx.text` |
| `scenes[].beats` | recommended | `ctx.at`, snapshots, future TTS alignment |
| `scenes[].narration` | optional now | TTS phase |
| `scenes[].transition_in` | optional (default cut) | runtime |

Visual types and transitions are listed in `engine/catalog.json`; unknown values are warnings, not
errors, so custom ones are allowed.
