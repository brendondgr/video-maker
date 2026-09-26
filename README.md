# video-maker

A Claude skill for making motion-graphics videos as code: a storyboard (JSON) plus one small
JavaScript builder per scene, animated with a single seekable GSAP timeline, validated by five
QA gates, and rendered frame-by-frame with headless Chromium + FFmpeg. Start with `SKILL.md`.

```
SKILL.md                 the workflow the agent follows
references/              depth: workflow, schema, API, visual catalog, motion design, validation, rendering, TTS roadmap
engine/                  runtime (browser) + scripts (Node) + catalog.json   ← run `npm install` here
  runtime/               vm.js (timeline core), boot.js, preview.js, vm.css, helpers/*.js
  scripts/               new-project, validate-storyboard, lint, check, snapshot, qa, preview, render, verify-output, doctor
templates/project/       what new-project.mjs copies
examples/gradient-descent/  a complete 50 s example that passes every gate
```

Setup: `cd engine && npm install && npx playwright install chromium && node scripts/doctor.mjs`

Try it:
```
node engine/scripts/qa.mjs examples/gradient-descent
node engine/scripts/preview.mjs examples/gradient-descent        # open the printed URL
node engine/scripts/render.mjs examples/gradient-descent --quality draft
```

Licences: GSAP ships under its own free "no charge" licence (all plugins included since 3.13);
D3 (ISC), Three.js/KaTeX/rough.js/Playwright (MIT/Apache-2.0), fonts (OFL).
