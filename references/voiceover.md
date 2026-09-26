# Voice-over, captions and sound

`voiceover.mjs` turns the storyboard's `narration` lines into a finished soundtrack, and fits the
picture to the voice:

```bash
node engine/scripts/voiceover.mjs <project> [--force] [--no-retime] [--mix-only] [--voice am_michael] [--speed 1.05]
```

| Step | Output | Notes |
|---|---|---|
| 1 Synthesize | `audio/vo/<scene>-<hash>.wav` + `.json` word timings | `kokoro-tts --batch` (local Kokoro-82M on GPU/CPU). Cached by text + voice + speed, so editing one line re-synthesizes one clip. Env `VM_TTS` swaps the command. |
| 2 Retime | `storyboard.json` rewritten | Each scene's `duration` = what its narration needs (below). Beats with `cue` snap to their word; other beats scale. The first run stores the silent plan in `scene.silent`, so later runs start from it. |
| 3 Assemble | `audio/voiceover.wav`, `audio/timing.json` | Clips are placed at scene start + that scene's transition + `pad_before`. |
| 4 Captions | `audio/captions.{json,srt,vtt}` | Only when `audio.captions.enabled`. |
| 5 Mix | `audio/mix.wav` (48 kHz stereo) | Voice + optional music bed (sidechain-ducked under the voice) + `sfx` cues, with two-pass loudnorm to −16 LUFS integrated, −1.5 dBTP. |

`render.mjs` uses `audio/mix.wav` automatically. HyperFrames receives it as `<audio id="vm-mix">`
in `index.html`, so both engines and Studio play the same sound. **Re-run `voiceover.mjs` after
any narration, voice, duration or transition change.** Gate 1 warns when the mix is older than
the storyboard.

## Settings (`storyboard.audio`)

```jsonc
"audio": {
  "voiceover": {
    "enabled": true,
    "voice": "am_michael",   // kokoro-tts --voices · af_heart (warm F), af_bella, am_michael (calm M), am_adam, bf_emma, bm_george (UK)
    "speed": 1.0,            // 0.9–1.15 reads naturally
    "lang": "a",             // a = US English, b = UK English
    "pad_before": 0.3,       // s of silence after the scene's own transition, before the first word
    "pad_after": 0.5,        // s after the last word, before the next scene starts transitioning in
    "retime": "fit",         // fit (duration = need) · extend (never shorter than planned) · off
    "loudness": -16,         // LUFS; use −14 for social feeds
    "true_peak": -1.5
  },
  "captions": { "enabled": true, "style": "clean", "position": "bottom", "max_words": 6, "size": 4.2 },
  "music": { "src": "assets/bed.mp3", "volume": 0.12, "duck": true, "fade_in": 1.5, "fade_out": 2.5 }
}
```

Per scene:

```jsonc
{ "id": "tournament", "narration": "Hypotheses then compete in a tournament…",
  "voice": { "pad_before": 0.2, "pad_after": 0.9 },   // override the pads for this scene
  "hold": 1.0,                                         // extra seconds after the line (a breather)
  "captions": false,                                   // hide captions on this scene (e.g. a title card)
  "beats": [ { "id": "elo", "t": 2.0, "cue": "text:Elo rating", "offset": -0.1 } ],
  "sfx": [ { "name": "whoosh-short", "at": "elo", "offset": -0.15, "volume": 0.3 } ] }
```

### How long a scene becomes

```
duration = transition_in + pad_before + narration + pad_after + next.transition_in + hold
```

rounded up to whole frames, and never below `rules.min_scene_duration`. The narration therefore
never overlaps the next scene's transition, and Gate 1 (`NARRATION_CUT`) enforces that.
- **With `retime: "extend"`,** planned durations are minimums. Use it when a scene needs time to
  animate after the line.
- **With `off`,** you own the durations, and Gate 1 fails any scene that is too short for its
  line.

### Beat cues

| Cue | Lands on |
|---|---|
| `"text:Elo rating"` | the first occurrence of that phrase in the scene's narration (case and punctuation ignored) |
| `"word:7"` | the 8th spoken word (0-based) |
| + `"offset": -0.1` | shift in seconds (start a reveal just before the word) |

A beat without a cue scales with the scene (`t × new/old duration`). Cue the beats a viewer would
notice being late: a number appearing as it is said, a node lighting up as it is named.
`VMX.pulse(ctx, el, { at: ctx.at('beat') })` is the simplest word-synced emphasis.

## Writing narration

These rules come from HyperFrames' `hyperframes-creative/references/narration.md` and
`story-spine.md`, adapted.
- **Pace.** Kokoro speaks about 2.3–2.6 words/s at speed 1.0; measured, `am_michael` is about 2.4 and
  `af_heart` about 2.65. Speed 1.05–1.1 still sounds natural. Budget about 70 words for 30 s,
  120–130 for 60 s, about 370 for 3 min and 1,250–1,350 for 10 min (pads cost about 1.2 s per
  scene), less if scenes need silent build time. Synthesize early and trim to the measured length.
- **Write for the ear.** One idea per sentence, 8–18 words. Put the subject and verb early. Avoid
  parentheses and stacked clauses.
- **Numbers the way they're said.** "two thousand three hundred drugs", "I-C-fifty",
  "eighteen-fold". Kokoro reads digits well, but abbreviations and symbols (IC50, ×, ±, α) need
  spelling out. Keep the symbol on screen.
- **Hook within 3 s.** State the value by the second scene. Every visual should trace back to a
  line in the source.
- **Don't read the screen.** Narration and on-screen text should complement each other: the
  screen shows the number, the voice says why it matters.
- **Check pronunciation** of names and jargon with a quick `kokoro-tts "…" -o /tmp/t.wav`. If a
  word is mangled, respell it phonetically in the narration only; captions show the narration
  text, so prefer respellings that still read correctly.

### Speaker style (default for technical and in-depth videos)

Write the narration the way a good lecturer talks, not the way a paper reads:
- **Open with a story or a surprise**, not a definition. A concrete case, a number that doesn't
  seem possible, a question the viewer can't answer yet. Name the topic after it.
- **Make hard ideas concrete with an image or a metaphor**, then map it back to the real thing:
  "Think of a busy kitchen: the Supervisor pins tickets to a rail, and whichever cook is free grabs
  the next one. The cooks are worker agents." Use one metaphor per concept, carry it through, and
  call back to it later. Every metaphor gets a picture (`visual-playbook.md` § 6).
- **Talk to the viewer:** "picture…", "here's the elegant part", "so, does it work?". Use
  questions as chapter bridges.
- **Signpost:** say where you are going ("three things make this work") and when a section ends.
- **Explain a rule, then show one worked example** with real numbers.
- **Numbers:** round them the way people say them, and give each one a comparison ("a decade of
  work, matched in two days").
- **Honesty in the voice:** say how a result was measured when it matters ("rated in its own
  tournament", "in one cell line"), and end with the limitations.
- For short videos (≤ 60 s) keep only the hook, one metaphor at most, and the takeaway.

## Captions

The captions overlay (`engine/runtime/helpers/captions.js`) follows HyperFrames' caption rules
(`media-use/audio/references/captions/authoring.md`):
- **One card at a time.** Cards break at sentence ends, at pauses of 0.15 s or more, and after a
  comma once 3 or more words have built up. Long runs split into near-equal chunks of at most
  `max_words`, and a card is never shorter than about 0.9 s.
- **Cards never cross a scene boundary,** and every card is hard-killed at its end time.
- **Styles:**
  - `clean` (default): unspoken words dimmed, lighting up as they are spoken;
  - `karaoke`: the current word takes the accent colour;
  - `plain`: static cards.
- **Legibility:** a dark pill with light text, readable on light and dark designs.
- **Caption zone:** the bottom ~16 % of the frame. Keep scene text out of it, or set
  `"captions": false` on the scene.

`audio/captions.srt` / `.vtt` ship next to the MP4 (`render.mjs --deliver`) for players and
platforms that prefer sidecar subtitles.

## Sound effects

`scene.sfx[]` cues resolve by `name` from HyperFrames' bundled pack
(`vendor/hyperframes/skills/media-use/audio/assets/sfx/`, Pixabay licence, no attribution
needed). Use `src` for a project file instead. `at` accepts a beat id, a scene-local number of
seconds, or `"end"`.

| Name | Length | Use for |
|---|---|---|
| `whoosh-short`, `whoosh`, `whoosh-cinematic` | 0.5–1.7 s | transitions and fast moves (put the peak on the cut: `offset` ≈ −0.15) |
| `pop`, `click-soft`, `click` | 0.4 s | nodes and chips appearing |
| `ping`, `chime`, `sparkle` | 1.3–2.5 s | a key number or reveal, a positive result |
| `impact-bass-1/2` | 2.1–2.6 s | a title slam (sparingly) |
| `riser` | 10 s | build-up; start it 10 s before the climax |
| `typing`, `key-press` | — | code or prompt entry |
| `glitch-1/2/3`, `error`, `notification` | — | UI and tech moments |

Keep SFX at 0.25–0.4 volume under narration. Two to four cues per minute read as polish; more
reads as noise.

## Music

`audio.music.src` loops a local file under the whole video, fades in and out, and is
sidechain-ducked under the voice (`duck: false` turns that off). Volume defaults: 0.12 under
narration, 0.9 for a silent video.

The skill doesn't bundle music. Options:
- a file the user provides;
- `node engine/scripts/hf.mjs . media-use resolve --type bgm --intent "calm curious" --project .`,
  which needs a HeyGen login;
- a MusicGen clip generated locally with the kokoro environment's torch. Note that MusicGen
  weights are **CC-BY-NC**, so they are not for commercial use.

Always state in the hand-off where the music came from and under which licence.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `could not run kokoro-tts` | `bash tts/install.sh`; check `kokoro-tts --check` (references/install.md) |
| A scene has a long silent tail | `retime` is `extend` and the planned duration is longer than the line; shorten `silent.duration` or use `fit` |
| A beat cue "not found in narration; scaled instead" | The phrase differs from the spoken text (typo, number spelled differently); cue a word that is in the line |
| Voice sounds rushed or flat | `speed` 0.95; split long sentences; add commas where a breath belongs |
| Captions overlap a label | Move the label above the caption zone, or `"captions": false` for that scene |
| Mix loudness warning | Very short or very quiet narration; check `audio/mix.wav`; the gate allows ±1.5 LU |
