# Long-form videos (5–15 min): pacing, splitting, parallel builds

A 10-minute explainer has 50–70 scenes. The workflow stays the same; three things change.

## 1 · Narration budget and pacing

- Kokoro speaks about **2.3–2.4 words/s at speed 1.0**. Speed 1.05–1.1 still sounds natural and
  gives about 2.4–2.5. Pads and transitions add about 1.1–1.3 s per scene. Budget:
  `words ≈ (target − 1.2 × scenes) × wps`. For 10 min with 65 scenes at 2.4 w/s, that's about
  1,250 words.
- Write the full script, synthesize early (`voiceover.mjs` runs at 10–20× real time on a GPU),
  and trim with the measured length in hand. Trim words; don't shorten pads. Tolerance is ±10 %.
- Structure (`visual-playbook.md` § 5): cold open → title and agenda → chapters (opener card,
  3–6 mechanism scenes, evidence) → limitations → close with a callback. Add a breather about
  once a minute.

## 2 · One storyboard or chapter projects

One storyboard handles ten minutes well: QA, rendering (≈2 min with `--engine hf`) and captions
stay simple. Split into chapter projects only above about 15 min, or when chapters must ship
separately. Chapter projects share a `style` block and the same `assets/img/`, and the renders
are concatenated with `ffmpeg -f concat`.

## 3 · Building scenes in parallel with sub-agents

When the environment offers sub-agents (Claude Code's Agent tool), build chapters in parallel
once the storyboard, voice and illustrations are done and the timings are final:

1. **Prepare shared ground first.** Final storyboard (retimed), the project `style.css` and
   `lib/` helpers, the illustrations, and at least one or two finished reference scenes that
   pass QA and show the look.
2. **One working copy per agent.** `rsync -a --exclude out --exclude qa <proj>/ <proj>-wA/`,
   and so on. Parallel `snapshot.mjs` runs on one project overwrite each other's contact
   sheets, so every agent works and snapshots in its own copy. Tell each agent to name its own
   copy explicitly in every command, and not to rely on shared helper scripts in a shared
   scratchpad.
3. **Split by chapter, 10–15 scenes per agent.** Four or five agents cover a 65-scene video.
4. **Give every agent the same brief.** Fill in `templates/scene-brief.md`: project facts, the
   hard rules, layout minimums, the review loop, what not to touch (storyboard, lib, audio), the
   scene list with global start times, and any scene-specific notes (exact numbers to compute,
   positions of features in images).
5. **Merge and re-check centrally.** Copy each agent's `scenes/*.js` into the main project,
   run `qa.mjs` on the whole video, and read **every** contact sheet yourself. Agents review
   their own scenes; you review the joins, the consistency across chapters and accuracy.
   Delete the working copies afterwards.
6. Library gaps the agents report (workarounds they needed) are candidates for kit
   improvements. Fix them in the kit or the project `lib/`, not in five scene files.

## 4 · QA at length

- `qa.mjs` samples every scene. Expect 10+ contact sheets for 10 minutes, and read them all.
- Accept warnings deliberately and write each reason down: outline-only decorative numerals
  (contrast), reading-rate warnings caused by UI or axis text, transient overlaps mid-animation.
  Fix everything else.
- After a fix, re-snapshot only the changed scenes (`snapshot.mjs --scene <id>` or `--times`).
  Before the final render, run the whole `qa.mjs` again.
