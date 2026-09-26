# Voice-over roadmap (planned — not implemented yet)

The current pipeline is silent, but the data model is already shaped for narration so adding TTS
does not require rewriting scenes.

## What already exists

- `scenes[].narration` — the line for each scene (write it now; it doubles as a clarity check).
- `scenes[].beats[]` with ids — scene code positions animation by `ctx.at('<beat>')`, never by
  hard-coded numbers.
- `audio.voiceover.enabled` — when true, gate 1 checks narration density (≤ 2.9 words/s) and gate 5
  requires an audio stream.
- `render.mjs --audio file` — muxes a track into the output.

## Planned pipeline

1. **Synthesize** per scene: `narration` → `audio/<scene>.wav` via a pluggable provider
   (local Kokoro/Piper, or an API such as ElevenLabs/OpenAI). Config in
   `audio.voiceover = { enabled, provider, voice, speed, pad_before, pad_after }`.
2. **Align**: word-level timestamps (Whisper or provider timings) → `audio/timing.json`
   `{ sceneId: { duration, words: [{ w, start, end }] } }`.
3. **Retime** (script `retime.mjs`): set each scene's `duration` to fit its audio (+ padding), and
   move beats that declare `"cue": "word:<index>"` or `"cue": "text:<phrase>"` to the matching word
   time. Scene code doesn't change because it reads `ctx.at()`.
4. **Assemble**: concatenate scene audio with transition overlaps → `audio/voiceover.wav`,
   loudness-normalise (`ffmpeg -af loudnorm=I=-16:TP=-1.5:LRA=11`).
5. **Render** with `--audio audio/voiceover.wav`; optional music bed ducked under speech
   (`sidechaincompress`).
6. **Validate**: audio/video duration match, no narration cut by a scene end, captions generated
   from the timing file (`.srt`/`.vtt`, optionally burned-in via a `captions` helper).

## Beat cue syntax (reserved)

```json
"beats": [
  { "id": "reveal", "t": 1.2, "cue": "text:downhill" },
  { "id": "count",  "t": 2.0, "cue": "word:7" }
]
```
`t` stays as the silent-version fallback.
