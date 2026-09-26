# Brief: example project for the scene kit and illustrations

- A 30-second example of the standard visual method (`references/visual-playbook.md`).
- It uses roles in `style.roles` and two generated illustrations (`storyboard.images` → `images.mjs`, codex backend).
- It exercises `K.bg`, `K.title`, `K.chapterScene`, a ghosted `K.flow` whose steps land on their words, and a `K.trend` with a reference line, live readout and footnote.
- The load-time numbers are **illustrative** and labelled that way on screen.
- To rebuild: `images.mjs` (cached by prompt hash in `assets/img/images.lock.json`), then `voiceover.mjs`, `qa.mjs` and `render.mjs`.
