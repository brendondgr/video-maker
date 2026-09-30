# Motion design — what makes it look professional

## Timing

| Motion | Duration | Ease |
|---|---|---|
| Small element enter (label, icon) | 0.35–0.5 s | `power3.out` |
| Title / card enter | 0.6–0.9 s | `power3.out` / `expo.out` |
| Exit | 0.3–0.45 s (faster than enter) | `power2.in` |
| Scene transition | 0.4–0.7 s | `power2.inOut` (fades: `none`) |
| Line/path draw | 0.8–2 s, ∝ length | `power1.inOut` |
| Counter | 1.2–2 s | `expo.out` (fast start, soft landing) |
| Camera drift / Ken Burns | whole scene | `none` |

- **Stagger** related items 0.05–0.12 s (words), 0.1–0.3 s (list items/bars).
- **Hierarchy through order**: the most important element arrives first or last, never in the middle of a crowd.
- **Overlap** actions: start the next move 0.1–0.3 s before the previous one ends.
- **Never freeze**: if nothing changes for > 2.5 s, add slow drift (`VMX.drift`), a highlight, or cut sooner. Gate 5 flags frozen stretches ≥ 4 s.
- **Reading time**: allow ≥ 1 s + words ÷ 3.2 s for text to be read after it lands.
- Prefer `power3/expo` curves to `back`/`elastic`; reserve overshoot (`pop`) for small, playful accents.

## Typography

- Sizes are in `u` (1 % of the short side). At 1080p, 1u = 10.8 px. Minimum body text ≈ 2.4u
  (26 px); the check flags anything under 2u.
- Scale: hero 11u · display 8u · title 5.6u · head 4u · body 3u · small 2.4u · label 2.6u caps.
- ≤ 2 families per video (sans + mono or serif). Tabular numbers for anything that counts.
- Line length ≤ ~40 characters for on-screen sentences; break manually at phrase boundaries.
- Avoid pure white on pure black; tint both toward the look's hue (design.mjs derives ink this way).
- HyperFrames' full-screen minimums (`hyperframes-creative/references/typography.md`): body ≥ 20 px,
  headlines ≥ 60 px, data labels ≥ 16 px at 1080p (≥ 32/90/24 for phone feeds). Track display
  text −0.02 to −0.05 em; on dark backgrounds add 0.05–0.1 line-height. Pair across categories
  (sans + serif or sans + mono), never two similar sans faces. Text on screen for 3 s must be
  readable in 2 s.
- Headings use `--f-display` (a preset may set a separate display face); body uses `--f-sans`.

## Colour

- One accent carries meaning ("this is the important thing"); a second for contrast/alternative;
  a warning colour only for bad/failure. Grey (`--c-line`, `--c-muted`) for everything secondary.
- Keep meaning stable across scenes: if teal = "our method" in scene 3, it's teal in scene 9.
- Sequential data → one-hue ramps (`d3.interpolateLab(dark, accent)`); diverging → two hues around a neutral.
- Check contrast ≥ 4.5:1 for body text, ≥ 3:1 for large text (gate 3 flags < 3:1 where it can measure).

## Layout

- Everything important inside `.safe` (5 % margins; raise to 8–10 % for social platforms that overlay UI).
- One focal point per frame. Titles top-left (or centred for statements), content in the middle
  60 %, source/footnotes bottom-right in `.t-small .muted`.
- Portrait (9:16): stack vertically, larger type (the short side is the width), captions in the
  upper-middle third, nothing in the bottom 15 % (platform UI).
- Leave air: if a frame looks full, it is too full.

## Transitions

Built in (`vm.js`): `cut fade slide-left slide-up wipe iris zoom blur`. Ported from HyperFrames
(`runtime/transitions.js`; source: `vendor/hyperframes/skills/hyperframes-animation/transitions/`):

| Type | Energy | Feel | Options (`transition_in.*`) |
|---|---|---|---|
| `crossfade` | any | both scenes dissolve | — |
| `blur-crossfade` | calm | **default for explainers**; hides background changes | — |
| `focus-pull` | calm | rack focus: old defocuses, new arrives sharp | — |
| `color-dip` | calm/medium | dip through a solid colour — a "new chapter" breath | `color` |
| `push` | medium | both scenes travel together | `direction: left|right|up|down` |
| `squeeze` | medium | old compresses to an edge, new expands | — |
| `diamond-iris` | medium | new scene opens from a centre diamond | — |
| `diagonal-split` | medium | old folds into the top-right corner | — |
| `staggered-blocks` | medium/high | palette panels sweep across, swap while covered | `blocks` (1–6), `colors` |
| `grid-dissolve` | medium | a cell grid ripples from the centre — reads as "data" | `cols`, `rows`, `color` |
| `zoom-through` | high | fly through the old scene into the new | — |
| `whip-pan` | high | fast horizontal smear | `direction: left|right` |

- Pick **2–3 types for the whole video** and repeat them; repetition reads as professional
  (HF `transitions/overview.md`). Typical explainer set: `blur-crossfade` within a chapter,
  `color-dip` or `staggered-blocks` at chapter boundaries, `cut` for rapid lists.
- Durations: snappy 0.2 · smooth 0.4 · gentle 0.6 · luxe 0.7 s. Energy should match the
  narration's.
- No exit animations right before a transition — the transition is the exit (except the last
  scene).
- Continuity beats transitions: if the next scene reuses an element (a chart, a node), keep it
  in one scene and change it in place, or use `VMX.camera` to move within one diagram.

## Pacing by length

- 15 s: one idea, 3–4 cuts, hook in the first second.
- 60 s: hook ≤ 4 s, 6–10 scenes, one "reveal" moment around 60–70 % in.
- 3+ min: chapter cards, recap, and a breather (full-bleed visual, minimal text) each minute.

## Data in motion (HF `hyperframes-creative/references/data-in-motion.md`)

- Pair every number with a visual that gives it weight (bar, ring, dot field) — a number alone is
  a caption.
- Keep one visual space for related stats (same axis, same scale) so change reads as change.
- No pie charts, dual axes, dashboards of 6+ panels, legends when direct labels fit, or
  decorative gridlines.
- Build a chart in reading order: axes → baseline series → the series that matters, highlighted
  last, with its label landing on the narration cue.

## Choosing a look

**There is no house style.** The look (palette, type, texture, illustration medium) is a creative
decision made for each video, in the brief, before the storyboard, and PLAN.md shows it for
approval. Two videos on different subjects should not look alike. The engine's fallback colours are
placeholder greys, and Gate 1 fails a storyboard that has no palette.

Watch for the **reflex look**: a navy background with a sky-blue accent and an amber second
accent. It was this skill's old built-in default, and it is what gets picked when nothing was
decided. Use it only when the subject calls for it, and say why.

1. **Start from the video, not from a palette.** Write 3–5 mood words from the subject, the
   audience, the tone and where it will play ("warm, tactile, historical"; "urgent, clinical";
   "playful, loud, social").
2. **Find the colours in the subject.** Where does it live, what is it made of, what era or brand
   is it? Pottery → fired clay and glaze. Ecology → leaf, soil, bark. Markets → ledger green and
   gold. Astronomy → deep violet night. Security → terminal black. Take the accent from there,
   not from the usual UI blue.
3. **Light or dark is part of the decision.** Papers, lectures, history and editorial topics often
   read best light (paper, cream, white). Night, space, cinema and code read dark. Social feeds
   want bold, saturated surfaces. Neither is the default.
4. **Type fits the voice.** Serif display for history, humanities and editorial; geometric sans
   for product and tech; rounded for friendly or kids; mono for code. Any Fontsource family works
   (`--display`, `--sans`).
5. **Set it and check it.** Use `design.mjs <project> --bg … --accent … [--accent-2 …] --look
   "<name>" --mood "<words>" --why "<reason>"`, or a preset (`--preset <name>`, with overrides as
   flags). Missing tokens are derived; fix every ✖ contrast line.
6. **Carry it everywhere.** Roles, chart ramps (`d3.interpolateLab(bg, accent)` read from
   `VMX.cssVar`, not literal hex), transition colours and the illustration style key all come from
   the look. Nothing in a scene hard-codes a colour the look doesn't contain.
7. **Series and brands.** A series reuses its look on purpose, and an organisation's brand colours
   become accent and accent-2. Otherwise, don't reuse the last video's look out of habit.

### Starting points (examples only; adapt them)

| Look | bg · ink · accent · accent-2 · accent-3 | Type | Fits |
|---|---|---|---|
| Paper & ink | #f7f5f0 · #1b1f24 · #2458d6 · #d9480f · #2b8a3e | Source Serif 4 + Inter | papers, lectures, methods |
| Terracotta | #f3ede2 · #2b211b · #b4441c · #2f6f62 · #8a5a00 | Fraunces + Work Sans | history, craft, food, archaeology |
| Botanical | #eef1e6 · #1d2a1f · #2f7a4a · #b8621b · #7a4a8c | Source Serif 4 + Inter | biology, ecology, agriculture |
| Chalkboard | #1f2a24 · #eeeadf · #f2d45c · #f08a7e · #8fd3e8 | Kalam labels + Inter | maths and teaching |
| Terminal | #0b0b0b · #e6e6e6 · #39e67f · #ff5ad1 · #ffd166 | JetBrains Mono + Inter | code, security, systems |
| Deep space | #08070f · #ecebf5 · #b18cff · #ffcf6b · #6be0d0 | Space Grotesk + Inter | astronomy, physics |
| Clinical | #fbfcfc · #14212b · #0b7f82 · #d9502a · #5b5fc7 | IBM Plex Sans | health, medicine, safety |
| Ledger | #101512 · #ece8dc · #d4ae3a · #4fbf7a · #e07a5f | DM Serif Display + Inter | finance, economics, markets |
| Pop | #fff3df · #1a1411 · #e0245e · #1d5fd1 · #a86200 | Bricolage Grotesque | social promos, consumer products |
| Blueprint | #113a63 · #eaf2fb · #ffd23f · #ff8c69 · #9fe3ff | Barlow + JetBrains Mono | engineering, architecture, hardware |
| Institutional | the organisation's two brand colours as accent/accent-2, neutrals derived | the brand's faces | lab, company or university pieces |

All of these pass the contrast checks with the derived surface, muted and line. `warn` is derived
too: red on light, coral on dark.

### HyperFrames frame presets

`design.mjs --list` shows the 13 vendored presets with their background, accents and fonts. Each
is a complete visual system (card treatment, spacing, what to avoid). `--preset <name>` maps its
colours and fonts into `storyboard.style` and copies its `design.md` into the project; read that
file. Choose a preset because it fits the video's mood, not because it comes first in the list.
Monochrome presets (`bold-poster`, `cobalt-grid`) need an `--accent` alongside. The nine HF
palettes (`hyperframes-creative/palettes/*.md`) are 5-colour rows to hand-pick from.
