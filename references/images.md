# Illustrations: generating images for a video

The skill includes an image generator: the `imagegen` dispatcher, vendored in
`imagegen/scripts/`, with its own docs in `imagegen/reference/`. `engine/scripts/images.mjs`
drives it from the storyboard. Use it wherever `visual-playbook.md` § 1 calls for an
illustration. **Don't use it for diagrams, charts or anything with text.** Those are built in
code.

```
storyboard.images ──► images.mjs ──► imagegen.sh (codex | comfy) ──► manifest.json ──► assets/img/<name>.jpg
  (style key +         (spec per item,   (one job per image,          (the only completion   + qa/images-contact-sheet.png
   one prompt each)     cached by hash)   3 codex / 1 comfy at once)   signal)                (look at it)
```

## 1 · Plan the images with the storyboard

List the illustrations while storyboarding, then add them to `storyboard.images`:

```jsonc
"images": {
  "backend": "codex",                 // default for every item (see § 3)
  "size": "landscape",                // landscape | portrait | square | wide | tall | WxH
  // built from THIS video's look (storyboard.style.look + palette); this one is for a "Terracotta paper" look
  "style": "Style: warm editorial gouache illustration with visible paper grain and soft hand-painted edges. Palette: cream paper ground (#f3ede2), fired-clay terracotta (#b4441c) and deep glaze teal (#2f6f62), dark umber shadows. Soft afternoon window light. Keep the main subject away from the top and bottom edges (the frame will be cropped to 16:9). Absolutely no text, letters, numbers, labels, logos or watermarks anywhere in the image.",
  "items": [
    { "name": "hero",    "prompt": "A scientist at a dim lab bench at night, seen from behind, looking up at six glowing orbs of light …" },
    { "name": "library", "prompt": "A lone researcher at the foot of an endless canyon of bookshelves …" },
    { "name": "cells",   "prompt": "…", "backend": "comfy", "model": "z-image-turbo", "seed": 1234 }
  ]
}
```

Then reference them from scenes as `assets/img/<name>.jpg`, and list them in each scene's
`assets` so gate 1 checks they exist.

Which scenes get an illustration:
- the hook, the chapter openers and the outro;
- each **metaphor** the narration leans on (the "lab meeting", the "tournament arena", the
  "plant breeder");
- subjects that code can't draw well: biology, places, people at work, machines;
- a breather about once a minute in long videos.

Six to fifteen images covers a 3–10 minute video. Reuse images across the videos of a series.

## 2 · Write prompts that work

Follow `imagegen/reference/prompting.md`. In short:
- **One style key for the whole video, written from its look.** It sets the palette (the
  video's own palette hex values: Gate 1 warns about hex codes that aren't in the palette), a
  medium and lighting that match the look's mood (gouache and paper grain for a warm historical
  look, crisp flat vector for a clinical one, neon-lit 3D for a terminal one), and the exclusions.
  Don't carry over a style key from another video or from this file's example. `images.mjs` appends it to every prompt,
  and `"style": false` on an item opts out.
- **Five axes per prompt:** subject (concrete, with its distinguishing details) · composition
  (framing, angle, what's in front and behind) · lighting · medium · constraints.
- **Design for the frame.**
  - The generator returns 3:2 or 2:3 images, and a 16:9 canvas crops the top and bottom about 8 %.
    Say "keep the subject away from the top and bottom edges".
  - If a title will sit on the image, ask for "the subject in the right half, the left third
    calm, dark negative space".
- **No text in images.** Say so explicitly in the style key. Put labels on in code.
- **Tie illustrations to the diagrams.** When the video has roles, describe subjects wearing
  the role colours or emblems (for example "six robots, each with its own accent light: blue,
  violet, amber, …"). The illustration then matches the diagrams without any text.
- Don't depict real people or brands. Keep scientific subjects stylised, not
  photo-documentary, unless the source provides real images.

## 3 · Choose a backend

| Backend | Use for | Cost / speed |
|---|---|---|
| `codex` | **Complex, multi-object editorial scenes** (the usual case for explainers); anything that must follow detailed composition instructions; transparent PNGs | rides the Codex subscription; ~60 s per image; 3 at a time |
| `comfy` + `z-image-turbo` | fast, free, simpler scenes and textures; many variations | local GPU; 40 s–2.5 min; one at a time |
| `comfy` + `krea2-turbo` | photographic looks | local; slower |
| `comfy` + `flux2-klein` | the only local family that renders short words reliably (rarely needed here) | local |

Default to `codex` for video illustrations unless the user prefers local generation. If the
user names a backend, use it. Setup: `codex login` for codex; `comfyui start` for comfy (port
8199, override with `COMFY_URL`). `doctor.mjs` reports both. The comfy model filenames are
specific to this machine's install (`imagegen/reference/backends.md`).

## 4 · Run it

```bash
node "$SKILL_DIR/engine/scripts/images.mjs" videos/<slug>             # generate what's missing or changed
node "$SKILL_DIR/engine/scripts/images.mjs" videos/<slug> --list      # what's up to date / pending
node "$SKILL_DIR/engine/scripts/images.mjs" videos/<slug> --only hero,cells --force   # redo some
```

- Run it **in the background** (Bash `run_in_background: true`) right after the storyboard is
  written. Images take minutes, and you can write the plan, synthesize the voice and build scenes
  meanwhile. Don't poll: the completion notice arrives on its own.
- Each item becomes an imagegen job `<slug>-<name>-<hash>` under `~/imagegen/jobs/` (override
  with `IMAGEGEN_ROOT`). Its spec is kept in `assets/img/specs/<name>.json`.
- Finished images become `assets/img/<name>.jpg`, scaled with Lanczos to cover the canvas.
  The seed, source and job are recorded in `assets/img/images.lock.json`. Unchanged items are
  skipped on the next run, so editing one prompt regenerates one image.
- A failed item is reported with its error and log tail. Fix the prompt or the backend and
  rerun; the other images stay.

## 5 · Review before use (required)

Open `qa/images-contact-sheet.png` with the Read tool. The red frame shows what the canvas will
actually display. For each image check:
- [ ] the right subject, matching the prompt's nouns;
- [ ] nothing important outside the red frame;
- [ ] no stray text, letters, watermarks or malformed hands or faces;
- [ ] it looks like the rest of the set (palette, medium).

`status: ok` only means a file exists, not that it's the right picture. Redo failures by
changing **one** prompt axis and rerunning that item with `--only <name> --force`. Keep the
seed to isolate the change.

## 6 · Use images in scenes

```js
const K = VMX.kit;
await K.bg(ctx, 'assets/img/hero.jpg', { scrim: 'left', from: 1, to: 1.08 });              // title over the dark side
await K.panel(ctx, 'assets/img/review.jpg', { x: W * .56, y: H * .17, w: W * .39, h: H * .6, at: 0.2 });
const cards = await K.imageCards(ctx, { items: [{ src: 'assets/img/cells.jpg', head: 'Leukemia', fact: '…', at: ctx.at('aml') }] });
```

- Builders that load images must be `async`, because the kit awaits `img.decode()`.
- Put a scrim behind text on an image (`scrim: 'left' | 'right' | 'full' | 'soft'`). A caption
  scrim is always added at the bottom.
- **Pointing at things inside an image:** pass `overlay: true` to `K.bg` and put markers,
  rings or labels in the returned `.over` layer, which moves with the push-in. Positions are in
  frame pixels. The image is scaled to cover the canvas, and `object-fit: cover` crops it
  centrally. Place markers, then check them in a snapshot.
- Keep push-ins gentle (to ≤ 1.1) when labels sit on image features.

## 7 · Licensing and hand-off

State in the hand-off which images were generated, by which backend, and that the prompts and
seeds are in `assets/img/`. Generated illustrations are original works; don't prompt for
copyrighted characters, logos or real people.
