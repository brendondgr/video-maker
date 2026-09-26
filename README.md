# video-maker

A Claude skill that makes narrated motion-graphics videos as code. It works in four steps:

1. **Plan.** A storyboard (JSON) holds the scenes, the narration and the beats. Each scene gets
   one small JavaScript builder, animated on a single seekable GSAP timeline.
2. **Voice.** Local GPU text-to-speech (Kokoro-82M) produces the narration with word timings.
   Scenes and beats are retimed to the voice, and captions, sound effects and a mastered mix are
   generated from it.
3. **Check.** QA gates (ours plus HyperFrames' `check`) run automatically, followed by a visual
   review of contact sheets.
4. **Render.** Output is deterministic 1080p or 4K MP4, from either the built-in
   Playwright + FFmpeg renderer or **[HyperFrames](https://github.com/heygen-com/hyperframes)**.
   Every project is also a valid HyperFrames composition, so HyperFrames Studio, lint and the
   renderer work on it directly.

Start with `SKILL.md`.

```
SKILL.md                 the workflow the agent follows
PLAN.md                  how video-maker and HyperFrames were combined (phased, with status)
references/              workflow, schema, API, visual catalog, motion design, voice-over, validation,
                         rendering, hyperframes bridge, install (Linux/macOS/Windows × GPU types)
engine/                  runtime (browser) + scripts (Node) + catalog.json   ← run `npm install` here
  runtime/               vm.js (timeline core), transitions.js, boot.js, preview.js, vm.css, helpers/*.js
  scripts/               new-project, design, validate-storyboard, lint, check, snapshot, qa, voiceover,
                         preview, render, verify-output, hf (HyperFrames bridge), sync-hyperframes, doctor
tts/                     kokoro-tts: CLI + installers (install.sh for Linux/macOS, install.ps1 for Windows)
vendor/hyperframes/      ten HyperFrames skills, vendored unmodified (Apache-2.0, pinned v0.8.77)
templates/project/       what new-project.mjs copies
examples/gradient-descent/  a complete 50 s example that passes every gate
```

Setup (details in `references/install.md`):

```bash
cd engine && npm install && npx playwright install chromium-headless-shell
bash ../tts/install.sh                     # narration; auto-detects ROCm / CUDA / XPU / MPS / CPU
node scripts/doctor.mjs --tts
```

Try it:

```bash
node engine/scripts/qa.mjs examples/gradient-descent
node engine/scripts/preview.mjs examples/gradient-descent           # open the printed URL
node engine/scripts/render.mjs examples/gradient-descent --engine hf --quality draft
node engine/scripts/hf.mjs examples/gradient-descent preview        # HyperFrames Studio
```

A narrated project:

```bash
node engine/scripts/new-project.mjs videos/demo --title "Demo" --voice am_michael --captions --design blue-professional
# write brief.md, storyboard.json (with narration) and scenes/*.js, then:
node engine/scripts/voiceover.mjs videos/demo && node engine/scripts/qa.mjs videos/demo
node engine/scripts/render.mjs videos/demo --engine hf --quality high --deliver ~/Videos/CustomSkill/demo
```

Licences:
- **GSAP:** its own free "no charge" licence (all plugins included since 3.13).
- **D3:** ISC.
- **Three.js, KaTeX, rough.js, Playwright:** MIT / Apache-2.0.
- **Fonts:** OFL.
- **HyperFrames skills and CLI:** Apache-2.0 (`vendor/hyperframes/LICENSE`, `NOTICE.md`).
- **Bundled SFX:** Pixabay Content License.
- **Kokoro-82M weights:** Apache-2.0.
