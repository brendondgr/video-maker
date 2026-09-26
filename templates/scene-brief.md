# Scene-building brief: {{VIDEO TITLE}}

You write **scene files only** (`scenes/<id>.js`) for part of a narrated explainer built with the
video-maker skill (deterministic HTML + GSAP; skill at `{{SKILL_DIR}}`). The storyboard
(narration, beats already fitted to the synthesized voice), audio, captions, illustrations,
project stylesheet and helpers already exist.

## Your assignment

- Working copy (yours alone): `{{COPY_DIR}}`. Name it explicitly in every command, and don't
  use helper scripts shared with other agents.
- Scenes: {{SCENE IDS}}
- Global start times (s) for `snapshot.mjs --times`: {{ID START, …}}
- Scene-specific notes: {{EXACT NUMBERS TO COMPUTE, IMAGE FEATURE POSITIONS, CONTINUITY WITH NEIGHBOURING SCENES}}

Do **not** edit `storyboard.json`, `lib/`, `style.css`, `index.html` or `audio/`. If the kit or a
helper blocks you, work around it inside your scene file and report it.

## Read first

1. `{{COPY_DIR}}/storyboard.json`: your scenes' `narration`, `on_screen_text` (→ `ctx.text[i]`),
   `visual.notes` (**the spec**), `beats` (→ `ctx.at(id)`), `assets`.
2. `{{SKILL_DIR}}/references/visual-playbook.md`: how scenes should look and move. Follow it.
3. `{{SKILL_DIR}}/references/composition-contract.md`: `ctx`, `VMX.*` and the scene kit `VMX.kit`.
4. Reference scenes that already pass QA: {{PATHS}}.

## Hard rules (the linter enforces them)

- `VM.scene('<id>', { build(ctx) {…} })`, or `async build` when loading images.
- Every animation goes on `ctx.tl` or through a `VMX.*` / `VMX.kit.*` helper. Not allowed:
  `Math.random` (use `ctx.random()`), `Date`, timers, rAF, CSS animation, `repeat: -1`.
- Times come from `ctx.at('<beat>')` plus small offsets. Entrances use `fromTo` with
  `immediateRender: true`.
- Per-frame values go in `ctx.onFrame` as pure functions of tweened proxies.

## Layout and look

Canvas {{W}}×{{H}}, u = {{U}} px. Safe margins 5 %. Captions are on: keep text above about
82 % of the height. Minimum sizes and all other rules are in visual-playbook.md § 3. Fill the
frame, one focal point, no dead frames, reveals on their words, roles' colours as declared.

## Check your work (`E={{SKILL_DIR}}/engine/scripts`)

- `node $E/lint.mjs {{COPY_DIR}}`: only your files matter.
- `node $E/snapshot.mjs {{COPY_DIR}} --scene <id>`, or `--times a,b,c`: open the sheet with the
  Read tool and look. Check against visual-playbook.md § 8.
- `node $E/check.mjs {{COPY_DIR}}`: fix every ERROR, and every OVERLAP / OFFSTAGE / CLIPPED /
  UNSAFE naming your scenes. Missing files for other agents' scenes are expected.
- Up to about 3 loops per scene.

{{HOST NOTE, e.g. "run node/ffmpeg via flatpak-spawn --host with the sandbox disabled"}}

## Deliverable

Your files in `{{COPY_DIR}}/scenes/`, plus a final message with each scene's status, the
warnings you accepted (and why), and any library workaround.
