# Workflow in detail

The phases in SKILL.md, with the judgement calls spelled out. Every phase leaves a file behind so
work can be resumed, reviewed or redirected.

| Phase | Output | Gate |
|---|---|---|
| 1 Intake | mode + spec (in `brief.md`) | — |
| 2 Digest | `brief.md` evidence bank | you can cite a source for every on-screen fact |
| 3 Narrative | arc + key messages (in `brief.md`) | fits the length budget |
| 4 Storyboard | `storyboard.json` | `validate-storyboard.mjs --plan-only`; user checkpoint |
| 5 Design | `storyboard.style`, `style.css` | contrast/legibility (checked in gate 3) |
| 6 Build | `scenes/*.js`, `lib/*.js`, `assets/` | lint + preview |
| 7 QA | `qa/report.md`, contact sheets | `qa.mjs` passes + visual rubric |
| 8 Render | `out/*.mp4` | `verify-output.mjs` |
| 9 Deliver | file + note | — |

---

## 1 · Intake

### Mode detection

- **Directed** if the user supplies any of: a scene list, a script, specific visuals ("show a bar
  chart of X"), exact durations, required text, a style reference. Partial direction is still
  directed for the parts they specified and open for the rest — mark which is which in the brief.
- **Open** if they supply material and a goal but no structure.

In directed mode the user's instructions are requirements. Keep their order, wording and
durations; if something they asked for will fail (e.g. 40 words in a 3 s scene), say so and
propose the smallest fix rather than silently changing it.

### Question bank (ask only what changes the outcome; max one AskUserQuestion round)

1. **Audience** — experts, students, general public, investors, reviewers?
2. **Purpose / placement** — conference talk opener, social clip, lab website, grant pitch, lecture?
   (Placement often decides aspect and length: social → vertical 15–60 s; talk → 16:9 60–180 s.)
3. **Length** — hard limit or approximate?
4. **Aspect / resolution / fps** — only if placement doesn't settle it.
5. **Style** — brand colours, fonts, light or dark, reference videos.
6. **Must-include / must-avoid** — figures, claims, logos, names.

If the user is away or the session is scheduled: do not block. Use defaults, write them under
"Assumptions made" in `brief.md`, and repeat them in the hand-off.

## 2 · Digest the sources (open mode especially)

1. Read every document completely (PDF, slides, papers, notes, data files). Don't skim the first page.
2. For data files, compute what you plan to show (totals, trends, comparisons) with a script and
   keep the script in `lib/` or `assets/` so numbers are reproducible.
3. Fill the **evidence bank** table: item · value/content · source (file + page/section) · candidate visual.
4. Pull figures you may reuse into `assets/` (export images from PDFs at ≥ 2× the size they'll
   appear). Prefer rebuilding simple charts from the numbers over pasting a screenshot of a chart —
   rebuilt charts can animate.
5. Separate **claims** (need a source) from **framing** (your words). Nothing numeric goes on screen
   without a source or an *illustrative* label.

## 3 · Narrative

Write ≤ 5 key messages in order, then pick an arc.

| Arc | Shape | Good for |
|---|---|---|
| **Question → answer** | hook question · stakes · mechanism (2–4 scenes) · payoff · takeaway | explainers, concepts |
| **Problem → solution → evidence** | pain · why it's hard · our approach · how it works · results · call to action | paper/project summaries, pitches |
| **Before → after** | status quo · change · consequence · what's next | announcements, results |
| **Zoom** | big picture · one part · the detail that matters · back out | systems, architectures |
| **List with spine** | promise ("3 ways…") · item 1..n · synthesis | tips, overviews (≤ 5 items) |

### Length budgets

| Total | Scenes | Structure notes |
|---|---|---|
| 10–20 s | 3–4 | one message; hook ≤ 2 s; no chapter titles |
| 30–60 s | 6–10 | 2–3 messages; hook ≤ 4 s; outro ≤ 4 s |
| 60–180 s | 10–25 | chapters with 2–3 s title cards; recap before outro |
| 3–10 min | 25–80 | chapters as groups of scenes; one "breather" scene per minute (full-bleed visual, little text); consider separate storyboards per chapter rendered and concatenated |

Rules of thumb: one idea per scene; 4–7 s per scene is the sweet spot; anything over ~12 s must keep
moving (drift, sequential builds, camera); on-screen reading ≤ 3.2 words/s after a 1 s settle.

### Long-form projects

- Keep a single storyboard up to ~5 min. Beyond that, split into chapter projects
  (`videos/<slug>/ch01-*`, …) sharing a `style` block and `lib/`; render each and concatenate:
  `ffmpeg -f concat -safe 0 -i list.txt -c copy full.mp4` (same resolution/fps/codec required).
- Use `render.mjs --scene <id>` while iterating so you only re-render what changed.
- Name beats consistently (`title`, `reveal`, `emphasis`, `exit`) so the voice-over phase can map
  narration onto them.

## 4 · Storyboard

See `storyboard-schema.md`. Write scenes in order; for each ask:
- **Purpose** — what does the viewer learn here that they didn't before? If nothing, cut it.
- **Visual** — the catalog type that shows it most directly (`visual-catalog.md`). Text is the
  last resort, not the first.
- **Beats** — the 2–4 moments where something changes. Space them ≥ 0.6 s apart.
- **Transition** — `cut` within a thought, `fade` between thoughts, stronger moves (`wipe`,
  `slide-*`, `iris`) at chapter boundaries. Keep transitions ≤ 0.7 s and use at most 2–3 kinds.
- **Narration** — write the line a narrator *would* say, even with voice-over off. It forces
  clarity and it's free input for the TTS phase.

Checkpoint table to show the user:

```
#  id           s    purpose                              visual
1  hook         4.5  pose the question                    kinetic-title
2  scale        4.5  stakes: 175B parameters              stat
…                                                         total 0:50.7
```

## 5 · Design system

Set `storyboard.style` once: palette (bg, surface, ink, muted, line, accent, accent-2, accent-3,
warn), fonts (bundled: Inter, JetBrains Mono, Source Serif 4; add others as local files), motion
(`ease`, `base` duration, `exit` duration). See `motion-design.md` for choices that read as
professional. Project-specific classes go in `style.css`, sized with `var(--u)`.

## 6 · Build

- Copy the closest scene from `examples/gradient-descent/scenes/` as a starting point.
- Shared computation (datasets, functions, precomputed paths) → `lib/*.js` loaded via
  `storyboard.assets.scripts`, so several scenes can use the same numbers.
- Build scene by scene with preview open (`?scene=<id>`), then run `lint.mjs` early and often.
- Keep each scene file under ~120 lines; split visual subroutines into `lib/`.

## 7 · QA → 8 · Render → 9 · Deliver

Covered in `validation.md` and `rendering.md`. The deliverable note should include: file(s) and
where they are, duration/resolution/fps, the scene list, assumptions, illustrative content, and
accepted warnings.
