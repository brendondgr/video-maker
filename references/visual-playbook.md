# Visual playbook: how every scene should look and move

This is the default visual method for every video. Apply it without being asked. The user may
override any part of it; otherwise it is the standard. The scene kit (`VMX.kit`,
`references/composition-contract.md` § Scene kit) implements most of it.

## 1 · Pick the medium for each idea

Decide per scene, in the storyboard, before writing code:

| The scene needs… | Medium | How |
|---|---|---|
| A process, architecture, mechanism, relationship or sequence the viewer should follow part by part | **SVG/HTML diagram built step by step** | `K.flow`, `VMX.cycle`/`hubSpokes`, `K.lanes`, `K.clusters`, cards and arrows. One part appears per beat. |
| A number, trend, comparison or distribution | **Chart built in reading order** | `K.trend`, `K.dotPlot`, `K.funnel`, `VMX.barChart`, `VMX.counter`. Axes first, then data, then the takeaway. |
| How a user operates a tool | **Illustrative UI mock-up** | `K.app`, `K.field`, `K.button` + `K.press`, `VMX.typeOn`, `K.tracker` for multi-step walkthroughs. Label it "illustrative". |
| A scene, a metaphor, an atmosphere, a subject that is hard to draw in code (cells, a laboratory, a crowd, a landscape, a machine) | **Generated illustration** | `references/images.md`. Use it full-bleed (`K.bg`), as a panel beside a diagram (`K.panel`), or in cards (`K.imageCards`). |
| A title, chapter or single claim | **Kinetic type** | `K.chapter`/`K.chapterScene`, `K.title`, `VMX.reveal`. |

Rules of thumb:
- **Diagrams are drawn, never generated.** Anything with labels, arrows, numbers or a structure
  the narration walks through is SVG/HTML. That way it animates step by step, stays legible at
  any size and says exactly what the source says.
- **Illustrations carry mood and metaphor, not facts.** Never let a generated image carry
  numbers or text. Overlay those in code.
- A good explainer alternates media. Roughly one illustration scene per 3–5 diagram or chart
  scenes keeps long videos from feeling like slides. In long videos, give every chapter opener
  an illustration background.

## 2 · Build step by step, on the word

The picture should explain what the voice is saying *as it says it*.

1. **Every reveal has a beat, and every beat has a cue.** When the narration names a part, that
   part appears on that word: `{ "id": "queue", "cue": "text:task queue" }`, then
   `K.flow(ctx, { steps: [ …, { label: 'Queue', at: ctx.at('queue') } ] })`. Start reveals
   0.1–0.3 s before the word (`offset: -0.2`) so they land as the word lands.
2. **Build in reading order:** context → parts → connections → result. Arrows draw just before
   the thing they point to appears.
3. **Emphasise the newest step.** The part being described glows or pulses (`K.glow`,
   `VMX.pulse`), and earlier parts dim slightly when the list grows long.
4. **No dead frames.** If the first beat is more than about 1.2 s into a scene, show something
   at 0.2–0.4 s: the title, the header, a background image, or the whole diagram *ghosted* at
   ~20 % opacity (`K.flow({ ghost: true })`) that lights up part by part. Nothing should sit
   still for more than 2.5 s. Add a slow drift or push-in when a frame must hold.
5. **Continuity across scenes.** When the next scene continues the same object (the same
   timeline, the same diagram), rebuild it at the same position so the cut feels like one shot.
   Then change it. Recurring UI (a mock-up app, a step tracker) keeps one frame position across
   its scenes.
6. **Hold the payoff.** The final state of each scene should be readable for at least 1 s
   before the transition, and the last scene of the video holds 1.5–2 s.
7. **Time every animation from the beats** (`ctx.at`). Never use fixed times beyond a first
   entrance at 0–0.5 s. The voice retimes scenes; cued scene code stays correct.

## 3 · Size and layout

The most common failure is diagrams that are **too small and float in empty space**. The
defaults:

| Element | Minimum at 1080p (u = 10.8 px) |
|---|---|
| Section title / header | 5–5.6u |
| Diagram labels, chips | 3–3.8u |
| Body text, card titles | 3–3.3u |
| Small notes, axis ticks | 2.4u (captions and footnotes only) |
| Icon badges | 6–9u |
| Cards | 28–40u wide |

- Fill the frame. A diagram should span most of the safe width. If it doesn't, enlarge it or
  pair it with an illustration panel.
- One focal point per frame.
- Safe area: 5 % margins. **With captions on, keep all scene text above about 82 % of the
  height**; the bottom band belongs to the captions.
- Put footnotes (source, "illustrative", "approx.") just above the caption band with `K.note`.

## 4 · Colour and identity

- **Roles:** give every recurring actor (agent, component, stakeholder, cell type) one colour
  and one icon for the whole video, in `storyboard.style.roles`. Use them everywhere: headers,
  chips, arrows, bars. Viewers learn the code quickly, and it ties diagrams to illustrations. You
  can ask for illustrations whose subjects wear the role colours.
- One accent means "this is the point". Warning red means bad or failed and nothing else.
  Everything secondary is grey.
- Illustrations share one **style key** (palette, medium, lighting) so they look like one set.
  Match the style key's palette to the video's palette.

## 5 · Structure for longer videos

| Length | Shape |
|---|---|
| ≤ 60 s | Hook → what it is → how it works (one diagram) → proof → what you do → takeaway. |
| 1–5 min | Chapters with 3–4 s chapter cards (`K.chapterScene`), each opening on an illustration. Recap before the outro. |
| 5–15 min | A **cold open** (a concrete story or surprising fact, before naming the topic), an agenda, then chapters. Each chapter: opener → mechanism in 3–6 scenes → evidence. A breather scene (full-bleed illustration, little text) about once a minute. **Callbacks:** return to the cold open's story in the evidence, and to the opening metaphor in the close. A limitations or caveats chapter before the end. |

For "how to use it" sections, use a numbered **step tracker** (`K.tracker`) that stays in the
same corner across the steps, and a consistent mock-up UI that evolves from step to step.

## 6 · Explain like a good speaker

Narration for technical material should sound like a good lecturer talking, not like the
paper being read aloud. See `voiceover.md` § Writing narration and § Speaker style. The visual
side of that:
- **Every metaphor gets a picture.** When the narration says "think of a kitchen rail with
  order tickets", the screen shows the rail (an SVG metaphor diagram) or an illustration of it.
  The metaphor and the real mechanism can share the frame: metaphor first, then labelled.
- Introduce each term once, on screen, the moment it is spoken (a key-term pill), and then use
  it consistently.
- Show a worked example when a rule is abstract (a formula followed by one concrete case with
  real numbers computed in code).

## 7 · Data honesty on screen

- Every number comes from the evidence bank. If values were read off a figure, say so on screen
  ("approx., read from Fig. 2a"). If a quantity is self-reported or self-evaluated, say that
  too.
- Label invented but plausible stand-ins (UI contents, example rankings, illustrative grids) as
  **illustrative**.
- Choose the chart that can't mislead. When lower is better (ranks, error, latency), use a dot
  plot with "← better" (`K.dotPlot`), not bars where the winner has the shortest bar. Keep one
  scale for things being compared.
- Compute derived numbers in code from the formula (for example a worked example's result),
  don't type them in by hand. Check they match the narration.
- Say exactly what a result shows: "in one cell line", "in organoids", "in its own tournament",
  not a broader claim.
- Format numbers consistently: thousands separators everywhere (`K.fmt`, `',.0f'`) and the same
  precision within a chart.

## 8 · Review loop (every video)

After `qa.mjs`, read every contact sheet and check each scene against these, on top of the
rubric in `validation.md`:
- [ ] Is anything **too small** or floating in empty space?
- [ ] Is any frame **dead** at its start (only a title for more than about 1 s)?
- [ ] Does each reveal land **on its word**? Check the caption text shown in the still.
- [ ] Is any text **overlapping** a legend, an axis label or another label? Look at the settled
      frame, not only the mid-animation ones.
- [ ] Is any on-screen claim **broader than the source**?
- [ ] Is anything that should be labelled **illustrative / approx.** not labelled?
- [ ] Does a counter or animation **finish before the scene ends**?
- [ ] Is anything inside the **caption band**?

Fix, re-snapshot the scenes you changed (`snapshot.mjs --scene <id>`), and look again.
