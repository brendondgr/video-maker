# Prompt construction

The backends are deterministic. The prompt is the only place judgment enters, which makes it the
only place quality comes from.

## The rule

**Never pass the user's request through unchanged.** "make me a logo for a coffee shop" is a
request, not a prompt. Expanding it is the job.

**But keep their nouns.** Expand *around* the user's idea; do not replace it with a more
photogenic one you like better. If they asked for a compass on a chart, every added clause should
make that compass more specific — not swap it for a sextant.

## The five axes

| Axis | Ask | Example clause |
|---|---|---|
| **Subject** | What exactly, with distinguishing detail? | "a weathered brass compass, fine engraving on the bezel" |
| **Composition** | Framing, angle, depth, foreground/background | "resting on a folded nautical chart, shallow depth of field" |
| **Lighting** | Direction, quality, time | "warm afternoon window light raking across the dial" |
| **Medium** | Photo (+ lens), painting, vector, 3D, pencil | "macro photograph" / "85mm lens" / "flat two-color vector" |
| **Constraints** | Palette, mood, exclusions | "muted teal and amber palette" |

Four to six clauses is the target. Past roughly eight the later ones start getting ignored, and
contradictions ("minimalist, highly detailed") actively degrade the result.

## Worked examples

**"a picture of a compass"**

> A weathered brass compass resting on a folded nautical chart, warm afternoon window light raking
> across the dial, shallow depth of field, fine engraved detail on the bezel, muted teal and amber
> palette, macro photograph

**"logo for a coffee shop called Bean Theory"** → `codex` or `flux2-klein`, because of the wordmark

> A flat vector logo badge for a coffee shop named BEAN THEORY, circular badge, the words BEAN
> THEORY set in clean geometric sans-serif around the top arc, a single coffee bean in the center,
> two-color design in deep brown and cream, crisp edges, no gradients

**"a photo of an old fisherman"** → `krea2-turbo`, because they said *photo*

> Candid portrait of an elderly fisherman mending a net on a harbour wall at dawn, deep wrinkles,
> salt-stained yellow oilskin, soft directional light from the left, 85mm lens, documentary
> photography

## Text inside the image

Put the exact string in caps and in quotes, say where it sits, and keep it short:

> a hand-lettered wooden shop sign, the sign reads "OPEN" in bold painted capital letters

One to three words is reliable on `flux2-klein`. A full sentence is not — use `codex` for that.
`z-image-turbo` and `krea2-turbo` will produce letter-shaped noise; don't ask them for words.

## Negative prompts don't work here

All three comfy families are guidance-distilled and run at CFG 1.0, so the negative branch is inert.
Express exclusions positively in the prompt instead: not `negative: "blurry"` but
`"crisp edges, sharp focus"`; not `negative: "gradients"` but `"flat two-color design, no gradients"`.

## Per-family register

- **`z-image-turbo`** — responds well to plain descriptive clauses. Skip "masterpiece, 8k,
  trending on artstation" style tag-soup; it's a legacy SD idiom and adds nothing here.
- **`krea2-turbo`** — rewards photographic vocabulary: lens length, film stock, lighting setup.
- **`flux2-klein`** — rewards explicit spatial and logical instructions ("three objects, left to
  right: X, Y, Z"). The one family that reliably follows counting and relative placement.

## Iterating

When an image is close but wrong, change **one** axis and rerun with a **new `job_id`** and the
**same seed**. Same seed + one changed clause isolates what that clause did. Changing three clauses
and the seed at once teaches you nothing.

To reproduce an earlier image exactly, take `params.seed` and `params.family` from its manifest.
