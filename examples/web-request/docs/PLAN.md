# How a Web Request Travels: production plan

> Timings are **final**, fitted to the synthesized narration.

## Overview

| | |
|---|---|
| Goal | Viewer can name the four hops of a web request. |
| Audience | curious beginners |
| Tone | friendly, clear |
| Length | target 0:30.0 · actual **0:29.1** |
| Scenes | 4 in 2 chapters |
| Narration | 60 words · voice `am_michael` @ 1× · captions: clean |
| Canvas | 1920×1080 @ 30 fps |
| Transitions | color-dip, blur-crossfade |
| Visual types | image ×1, kinetic-title ×1, diagram ×1, line-chart ×1 |

## Assets

**Generated illustrations** (2, `images.mjs` → imagegen, default backend `codex`). All share this style key:

> Style: cinematic editorial illustration with painterly digital shading and subtle film grain. Palette: deep midnight-navy background (#0b0f17), luminous blue (#5eb0ff) and warm amber (#ffb454) light accents. Keep the main subject away from the top and bottom edges (the frame will be cropped to 16:9). Absolutely no text, letters, numbers, logos or watermarks.

| Image | Backend | Used in | Prompt |
|---|---|---|---|
| `city` | codex | `hook` | A night city seen from a high balcony, thin streams of blue and amber light racing between buildings like data, one glowing laptop on the balcony railing in the right half of the frame, the left third calm dark sky. |
| `racks` | codex | `ch1` | A long aisle of server racks in a dark data centre, rows of tiny blue and amber status lights receding to a vanishing point, soft haze, low camera angle. |

**Built in code** (SVG/HTML + GSAP): every diagram, chart, UI mock-up, icon and title card. Each diagram builds step by step, and every step is keyed to the narration word that names it (beat cues).

**Sound:** narration (local TTS) · 0 SFX cue(s) · no music.

## Scene table

| # | Time | Scene | Visual | Purpose | Narration (first words) |
|---|---|---|---|---|---|
| 1 | 0:00.0 (8.7 s) | `hook` | image | Hook: every click starts a journey. | Every time you click a link, a… |
| 2 | 0:08.1 (3.7 s) | `ch1` | kinetic-title | Chapter card. | Let's follow it.… |
| 3 | 0:11.3 (10.7 s) | `hops` | diagram | The four hops, built on the words. | Your browser asks DNS for the address,… |
| 4 | 0:21.5 (7.6 s) | `latency` | line-chart | Illustrative latency trend with baselines. | And with caching, each repeat visit gets… |

## Scene details

### 00 · Opening

#### 1. `hook`: 0:00.0, 8.7 s

- **Purpose:** Hook: every click starts a journey.
- **Narration** (21 words): “Every time you click a link, a tiny message races across the world and back in a fraction of a second.”
- **On screen:** “Web basics” · “How a request travels”
- **Visual (image):** city.jpg push-in, title on the dark left third.
- **Animation beats:** `title` on “click”
- **Assets:** `assets/img/city.jpg`
- **Transition in:** none

### 01 · The four hops

#### 2. `ch1`: 0:08.1, 3.7 s

- **Purpose:** Chapter card.
- **Narration** (3 words): “Let's follow it.”
- **On screen:** “01” · “The four hops”
- **Visual (kinetic-title):** Chapter card over racks.jpg.
- **Animation beats:** `num` @ 0.211s
- **Assets:** `assets/img/racks.jpg`
- **Transition in:** color-dip 0.6s

#### 3. `hops`: 0:11.3, 10.7 s

- **Purpose:** The four hops, built on the words.
- **Narration** (22 words): “Your browser asks DNS for the address, sends the request to a server, and the server fetches your data from a database.”
- **On screen:** “Browser” · “DNS” · “Server” · “Database”
- **Visual (diagram):** K.flow ghosted; each hop lights on its word.
- **Animation beats:** `b` on “browser” → `d` on “DNS” → `s` on “server” → `db` on “database”
- **Transition in:** blur-crossfade 0.5s

#### 4. `latency`: 0:21.5, 7.6 s

- **Purpose:** Illustrative latency trend with baselines.
- **Narration** (14 words): “And with caching, each repeat visit gets faster, dropping below the one second mark.”
- **On screen:** “Page load over a session” · “load time (ms)” · “illustrative numbers”
- **Visual (line-chart):** K.trend with a reference line and live readout; illustrative.
- **Animation beats:** `axes` @ 0.285s → `draw` on “caching” → `ref` on “one second”
- **Transition in:** blur-crossfade 0.5s

## Production steps

1. Brief and evidence bank (`brief.md`): every on-screen number traced to a source.
2. Illustrations: `images.mjs` (2 image(s)); review `qa/images-contact-sheet.png`.
3. Storyboard (this plan): `validate-storyboard.mjs --plan-only`, then show this plan to the user.
4. Voice (`voiceover.mjs`): synthesize, fit scenes to the words, cue beats, captions, mix. Then re-run `plan.mjs` for final timings.
5. Scenes (`scenes/<id>.js`): scene kit + helpers, every time taken from `ctx.at(beat)`. For long videos, build chapters in parallel (`references/long-form.md`).
6. QA (`qa.mjs`): look at every contact sheet against `validation.md` and `visual-playbook.md` § 8.
7. Render (`render.mjs`) and verify (`verify-output.mjs`), then spot-check frames, then deliver.
