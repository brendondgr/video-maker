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
- Avoid pure white on pure black; the default palette uses #eef2f8 on #0b0f17.

## Colour

- One accent carries meaning ("this is the important thing"); a second for contrast/alternative;
  a warning colour only for bad/failure. Grey (`--c-line`, `--c-muted`) for everything secondary.
- Keep meaning stable across scenes: if blue = "our method" in scene 3, it's blue in scene 9.
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

- `cut` inside a thought; `fade` between thoughts; `wipe/slide/iris` at chapter boundaries.
  Use at most 2–3 kinds per video.
- Continuity beats transitions: if the next scene reuses an element (a chart, a node), consider
  keeping it in one scene and changing it in place.

## Pacing by length

- 15 s: one idea, 3–4 cuts, hook in the first second.
- 60 s: hook ≤ 4 s, 6–10 scenes, one "reveal" moment around 60–70 % in.
- 3+ min: chapter cards, recap, and a breather (full-bleed visual, minimal text) each minute.

## House styles (starting points; copy into `storyboard.style`)

- **Lab dark** (default): bg #0b0f17 · ink #eef2f8 · accent #5eb0ff · accent-2 #ffb454 · accent-3 #7ee0a1.
- **Paper light**: bg #f7f5f0 · surface #ffffff · ink #1b1f24 · muted #5d6570 · line #d9d4ca · accent #2458d6 · accent-2 #d9480f · accent-3 #2b8a3e. (Add `.katex { color: var(--c-ink) }` if needed.)
- **Institutional**: take the organisation's two brand colours as accent/accent-2, keep neutrals grey.
