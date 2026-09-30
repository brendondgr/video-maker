# How a Web Request Travels

A video-maker project. This file is rewritten by the
scripts; don't edit it by hand.

## Finish it in a video editor

Open **`edit/how-a-web-request-travels.otio`** in DaVinci Resolve, Premiere Pro, Kdenlive (25.04+) or Avid. For
Final Cut Pro, Shotcut, OpenShot, Lightworks or an EDL, ask for a conversion
(`timeline.mjs <project> --to <editor>`). Import it once; after that the edit lives in your editor's
own project. When a scene is re-rendered its clip in `edit/video/` is replaced in place, so your
editor picks up the new version.

| Track | Contents |
|---|---|
| V1 Scenes | `edit/video/<scene>.mov`, one clip per scene, with 1 s handles |
| V2 Transitions | `edit/video/<a>__<b>.mov` over each cut (delete one for a hard cut) |
| V3 Captions | `edit/overlay/captions.mov` (alpha), or import `edit/captions/captions.srt` |
| A1–A3 | voice per scene, music bed, sound effects (`edit/audio/`) |
| A4 | the mastered mix (muted; the reference loudness) |

## Folders

| Folder | Zone | What it holds |
|---|---|---|
| `storyboard.json`, `index.html`, `style.css`, `scenes/`, `lib/` | author | the composition: the HTML/CSS/JS every clip is rendered from |
| `docs/` | author | brief, production plan, narration script |
| `assets/` | author | inputs: illustrations, fonts, music |
| `edit/` | hand-off | the edit package: clips, stems, captions, timeline |
| `exports/` | hand-off | finished videos |
| `.build/` | disposable | caches, QA reports, previews; safe to delete |
| `_engine` | — | link to the video-maker engine (needed by HyperFrames) |

## State

| | |
|---|---|
| ✔ Brief | `docs/brief.md` |
| ✔ Plan + script | `docs/PLAN.md`, `docs/SCRIPT.md` |
| · Voice-over and mix | `edit/audio/mix.wav` |
| · Scene clips | 0 scene(s), 0 transition(s) in `edit/video/` |
| · Timeline | `edit/how-a-web-request-travels.otio` |
| · Exports | none yet |
