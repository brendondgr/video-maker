// README.md for a layout-2 project: what each folder holds, how to open the edit, and what has
// been produced so far. Rewritten by new-project, plan, voiceover, render and timeline, so it
// always describes the folder as it is. Layout-1 projects are left alone.
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './paths.mjs';

const count = (dir, re) => { try { return fs.readdirSync(dir).filter((f) => re.test(f)).length; } catch { return 0; } };
const has = (p) => fs.existsSync(p);
const mb = (p) => { try { return (fs.statSync(p).size / 1e6).toFixed(1) + ' MB'; } catch { return ''; } };

export function writeReadme(dir, sb) {
  const P = projectPaths(dir, sb);
  if (P.layout < 2) return null;
  sb = sb || JSON.parse(fs.readFileSync(path.join(dir, 'storyboard.json'), 'utf8'));
  const slug = sb.meta?.slug || path.basename(dir);
  const title = sb.meta?.title || slug;
  const otio = path.join(P.edit, `${slug}.otio`);
  const conv = count(P.edit, /\.(fcpxml|xml|mlt|edl|aaf|otioz)$/);
  const clips = count(P.editVideo, /^[^_][^.]*\.mov$/) - count(P.editVideo, /__/);
  const trans = count(P.editVideo, /__.*\.mov$/);
  const exports = (() => { try { return fs.readdirSync(P.exports).filter((f) => /\.(mp4|webm|mov)$/.test(f)); } catch { return []; } })();
  const tick = (b) => (b ? '✔' : '·');

  const md = `# ${title}

A video-maker project. This file is rewritten by the
scripts; don't edit it by hand.

## Finish it in a video editor

Open **\`edit/${slug}.otio\`** in DaVinci Resolve, Premiere Pro, Kdenlive (25.04+) or Avid. For
Final Cut Pro, Shotcut, OpenShot, Lightworks or an EDL, ask for a conversion
(\`timeline.mjs <project> --to <editor>\`). Import it once; after that the edit lives in your editor's
own project. When a scene is re-rendered its clip in \`edit/video/\` is replaced in place, so your
editor picks up the new version.

| Track | Contents |
|---|---|
| V1 Scenes | \`edit/video/<scene>.mov\`, one clip per scene, with 1 s handles |
| V2 Transitions | \`edit/video/<a>__<b>.mov\` over each cut (delete one for a hard cut) |
| V3 Captions | \`edit/overlay/captions.mov\` (alpha), or import \`edit/captions/captions.srt\` |
| A1–A3 | voice per scene, music bed, sound effects (\`edit/audio/\`) |
| A4 | the mastered mix (muted; the reference loudness) |

## Folders

| Folder | Zone | What it holds |
|---|---|---|
| \`storyboard.json\`, \`index.html\`, \`style.css\`, \`scenes/\`, \`lib/\` | author | the composition: the HTML/CSS/JS every clip is rendered from |
| \`docs/\` | author | brief, production plan, narration script |
| \`assets/\` | author | inputs: illustrations, fonts, music |
| \`edit/\` | hand-off | the edit package: clips, stems, captions, timeline |
| \`exports/\` | hand-off | finished videos |
| \`.build/\` | disposable | caches, QA reports, previews; safe to delete |
| \`_engine\` | — | link to the video-maker engine (needed by HyperFrames) |

## State

| | |
|---|---|
| ${tick(has(P.brief))} Brief | \`${P.rel.brief}\` |
| ${tick(has(P.plan))} Plan + script | \`${P.rel.plan}\`, \`${P.rel.script}\` |
| ${tick(has(P.mix))} Voice-over and mix | \`${P.rel.mix}\` |
| ${tick(clips > 0)} Scene clips | ${clips} scene(s), ${trans} transition(s) in \`edit/video/\` |
| ${tick(has(otio))} Timeline | \`edit/${slug}.otio\`${conv ? ` + ${conv} converted file(s)` : ''} |
| ${tick(exports.length > 0)} Exports | ${exports.length ? exports.map((f) => `\`exports/${f}\` (${mb(path.join(P.exports, f))})`).join(', ') : 'none yet'} |
`;
  fs.writeFileSync(P.readme, md);
  return P.readme;
}
