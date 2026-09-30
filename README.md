# video-maker

A Claude skill that makes narrated motion-graphics videos as code. It works in five steps:

1. **Plan.** A storyboard (JSON) holds the scenes, the narration and the beats. Each scene gets
   one small JavaScript builder, animated on a single seekable GSAP timeline.
2. **Illustrate.** Illustrations are declared in the storyboard (one shared style key plus one
   prompt each) and generated through the bundled `imagegen` dispatcher (Codex or a local
   ComfyUI). Diagrams and charts are never generated: they are built in SVG, step by step, with
   each step landing on the word that names it (`references/visual-playbook.md`).
3. **Voice.** Local GPU text-to-speech produces the narration with word timings: Kokoro-82M by
   default, or Breeze TTS 2 for a cloned or designed voice (non-commercial).
   Scenes and beats are retimed to the voice, and captions, sound effects and a mastered mix are
   generated from it.
4. **Check.** QA gates (ours plus HyperFrames' `check`) run automatically, followed by a visual
   review of contact sheets.
5. **Render.** Output is deterministic 1080p or 4K MP4, from either the built-in
   Playwright + FFmpeg renderer or **[HyperFrames](https://github.com/heygen-com/hyperframes)**.
   Every project is also a valid HyperFrames composition, so HyperFrames Studio, lint and the
   renderer work on it directly.

Start with `SKILL.md`.

```
SKILL.md                 the workflow the agent follows
PLAN.md                  how video-maker and HyperFrames were combined (phased, with status)
references/              workflow, visual playbook, images, long-form, schema, API, visual catalog, motion design,
                         voice-over, validation, rendering, hyperframes bridge, install (Linux/macOS/Windows × GPU types)
engine/                  runtime (browser) + scripts (Node) + catalog.json   ← run `npm install` here
  runtime/               vm.js (timeline core), transitions.js, boot.js, preview.js, vm.css, helpers/*.js
                         (helpers/kit*.js = the scene kit: frame parts, step-by-step diagrams, charts, UI mock-ups)
  scripts/               new-project, design, validate-storyboard, plan, images, lint, check, snapshot, qa, voiceover,
                         preview, render, verify-output, hf (HyperFrames bridge), sync-hyperframes, doctor
imagegen/                bundled image dispatcher (codex / comfy backends, manifest contract), used by images.mjs
tts/                     speech engines: setup.sh (inspects the machine, then installs), kokoro-tts,
                         breeze/ (breeze-tts + patches), registry.py; install.ps1 for Windows (Kokoro)
vendor/hyperframes/      ten HyperFrames skills, vendored unmodified (Apache-2.0, pinned v0.8.77)
templates/project/       what new-project.mjs copies · templates/scene-brief.md: brief for parallel scene builds
examples/gradient-descent/  a complete 50 s example that passes every gate
examples/web-request/    a 30 s narrated example using the scene kit, roles and generated illustrations
```

Setup (details in `references/install.md`):

```bash
cd engine && npm install && npx playwright install chromium-headless-shell
bash ../tts/setup.sh --plan                # narration: shows what this machine needs (ROCm/CUDA/MPS/CPU)
bash ../tts/setup.sh                       # then installs Kokoro, and Breeze if you accept its licence
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
node engine/scripts/new-project.mjs videos/demo --title "Demo" --voice am_michael --captions
# choose this video's look (no default palette; see references/motion-design.md § Choosing a look):
node engine/scripts/design.mjs videos/demo --bg "#eef1e6" --accent "#2f7a4a" --look "Botanical" --why "a plant-biology explainer"
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
- **Breeze TTS 2:** code Apache-2.0 (the patches in `tts/breeze/patches/` are too); the weights
  and everything they generate are research / non-commercial only. Downloaded at install time,
  not bundled.
