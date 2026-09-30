# Finishing a video in an editor (the edit package)

The skill builds the video; a person finishes it by hand. Every layout-2 project carries an
**edit package** in `edit/`: one media file per scene, per transition and for the captions, the
audio as separate stems, and an open **OpenTimelineIO** timeline that lays them out. Any editor
can import it. After that the editor's own project holds the hand edits, and nothing the skill
does overwrites them.

```
edit/
├─ <slug>.otio            the timeline (canonical; plain JSON)
├─ <slug>.fcpxml / .mlt / .xml / .kdenlive / .aaf / .edl / .otioz   conversions, on request
├─ video/<scene>.mov      V1: one clip per scene, ProRes 422, with 1 s handles
├─ video/<a>__<b>.mov     V2: each transition, over the cut
├─ overlay/captions.mov   V3: captions (and other overlays) with alpha, ProRes 4444
├─ audio/voice/<scene>.wav  A1: that scene's narration, cut on the scene's range
├─ audio/music.wav        A2: the ducked music bed
├─ audio/sfx/NN-name.wav  A3: each sound effect (A3b, A3c… when cues overlap)
├─ audio/mix.wav          A4: the mastered mix (track disabled; the loudness reference)
├─ audio/stems.json       where each stem sits
└─ captions/captions.srt  editable captions (.vtt and .json too)
```

## Making it

```bash
node "$SKILL_DIR/engine/scripts/voiceover.mjs" <project>      # stems + captions (with the mix)
node "$SKILL_DIR/engine/scripts/render.mjs" <project>         # clips (stale ones only) + exports/<slug>.mp4
node "$SKILL_DIR/engine/scripts/timeline.mjs" <project>       # edit/<slug>.otio
node "$SKILL_DIR/engine/scripts/timeline.mjs" <project> --to finalcut,shotcut   # conversions
```

`render.mjs --edit` refreshes the clips without making the MP4. `segments.mjs <project>` lists
every clip, where it sits and whether it is stale. Old (layout-1) projects need
`migrate-layout.mjs <project>` once.

## Which file to open

| Editor | `--to` | Open | What it loses |
|---|---|---|---|
| DaVinci Resolve 18+ | `resolve` (the `.otio`) | File → Import → Timeline | nothing |
| Premiere Pro (recent) | `premiere` (the `.otio`) | File → Import | nothing; older versions: `premiere-legacy` |
| Premiere Pro (any) | `premiere-legacy` → `.xml` | File → Import (Final Cut Pro XML) | nothing measurable |
| Kdenlive 25.04+ | `kdenlive` (the `.otio`) | File → Import → OpenTimelineIO | nothing |
| Kdenlive before 25.04 | `kdenlive-legacy` → `.kdenlive` | File → Open | deprecated adapter |
| Final Cut Pro | `finalcut` → `.fcpxml` | File → Import → XML | markers; V2/V3 become connected clips |
| Shotcut | `shotcut` → `.mlt` | File → Open | markers, the muted reference mix |
| OpenShot | `openshot` → `.xml` | File → Import → Final Cut Pro XML | markers (OpenShot ignores them) |
| Lightworks | `lightworks` → `.xml` | Import → XML | — |
| Avid Media Composer | `avid` (`.otio`) or `avid-aaf` → `.aaf` | Import | AAF: markers; relink by name |
| Anything | `edl` → `.edl` | Import EDL | everything but the V1 cut list |
| Another machine | `bundle` → `.otioz` | as the `.otio` | nothing (media inside, relative) |

`timeline.mjs --list` prints this table. Every conversion is read back and compared with the
`.otio`; the script prints what the format dropped. **Paths:** the `.otio`, `.mlt` and `.otioz`
use media paths relative to `edit/`, so the folder can move. FCP7 XML, FCPXML, `.kdenlive` and AAF
need absolute paths and are written for the machine they were made on; re-run the conversion on
another machine, or relink media in the editor.

## The tracks

- **V1 Scenes.** Each clip is the scene rendered alone, plus **1 s handles**: the scene's first
  frame held before it and its last frame held after it (`--handles`). Slide a cut, extend a hold
  or add a dissolve without re-rendering.
- **V2 Transitions.** The designed transition (a GSAP animation, not an editor effect) sits over
  each cut. Delete a V2 clip for a hard cut, or replace it with the editor's own transition,
  which the handles make room for.
- **V3 Captions.** A transparent layer with the burned-in caption style. Disable it and import
  `edit/captions/captions.srt` instead if you want to edit the words. Every editor above imports
  SRT as a caption or subtitle track.
- **A1 Voice** clips line up with their V1 clips, so a scene and its narration trim together.
- **A2 Music**, **A3 SFX**: stems are 48 kHz 32-bit float and already at the mastered level
  (they sum to the mix before its limiter). Float never clips, so turn a hot stem down rather
  than worrying about 0 dBFS.
- **A4 Mix** is the mastered −16 LUFS mix, disabled. Use it as a reference, or enable it and mute
  A1–A3 when you only change pictures.
- **Markers:** green at every scene start (named by scene id, comment = its purpose), blue at every
  beat (named by beat id, comment = the cue phrase). Reveals are timed to land on these.

## When the video changes after you've started editing

Only what changed is re-rendered, and each clip is **replaced in place under the same name**
(no versions are kept). So your editor project picks up the new picture next time it reads the
file. Most editors do this on reopen; Resolve may need *Relink* or *Refresh*, and Premiere may need
*Refresh Media* on the clip.

- **Same length** (a label, a colour, a diagram fix): nothing to do beyond the refresh.
- **Different length** (new narration, a retimed scene): the clip's handles and length change.
  Trim or extend that one clip. If you haven't edited much yet, re-import the fresh `.otio` instead.
- **Scenes added, removed or reordered:** new clips appear, removed ones are deleted from
  `edit/video/`. Re-import the `.otio`, or place the new clip by hand at its green marker.

When Claude changes a video it says which clips changed and whether any length changed.

## What an editor can and cannot change

An editor can change anything **between and around** scenes: cuts, pacing, holds, order,
transitions, audio levels and mix, captions (via SRT), colour, crops, titles on top. It cannot
reach **inside** a scene's animation. Moving a label within a diagram, changing a chart's data or
restyling a card is a change to `scenes/<id>.js` or `style.css`; then only that scene's clip is
re-rendered.

## Media formats and size

ProRes 422 (default) opens in every editor above on Windows, macOS and Linux. DaVinci Resolve free
on Linux cannot decode H.264 or AAC, which rules out lighter defaults. It is large: up to about
1.1 GB per minute at 1080p30 (the 29 s web-request example's whole `edit/`, handles and caption
layer included, is about 460 MB). 4K is about four times that. Lighter options:
`--edit-codec h264i` (all-intra H.264, much smaller, not for Resolve free on Linux) or `dnxhr`. Set
a project default in `storyboard.edit` (`{ "codec": "prores", "handles": 1 }`). `edit/video`,
`edit/overlay` and `edit/audio` are git-ignored; `.build/` can be deleted at any time.

## Troubleshooting

- **Media offline after moving the project:** the `.otio`/`.mlt` resolve paths relative to
  `edit/`; keep the folder together. For XML/FCPXML/AAF, re-run `timeline.mjs --to …` on this machine.
- **Captions look doubled:** V3 and an imported SRT track are both on; disable one.
- **A clip shows the old picture:** the editor cached it; relink or refresh that clip (see above).
- **Converters missing:** `bash engine/timeline/setup.sh` (Windows: `setup.ps1`), then
  `doctor.mjs --timeline`.
- **ISOLATION error in QA (gate 3c):** a scene renders differently alone than inside the video, so
  its clip would be wrong. See `validation.md` § Gate 3c.
