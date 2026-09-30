// Every file a project reads or writes, in one place.
//
//   const P = projectPaths(dir[, sb]);   P.mix, P.qa, P.captions.json, P.rel.mix, …
//
// Layout 1 is the original flat layout (brief.md, audio/, qa/, out/ at the project root).
// Scripts pick the layout from storyboard.meta.layout, so old projects keep working unchanged.
import fs from 'node:fs';
import path from 'node:path';

export const LATEST_LAYOUT = 1;

export function layoutOf(sb) { return +(sb?.meta?.layout) >= 2 ? 2 : 1; }

const V1 = {
  docs: '.', brief: 'brief.md', plan: 'PLAN.md', script: 'SCRIPT.md', readme: 'README.md',
  assets: 'assets', img: 'assets/img', fonts: 'assets/fonts', music: 'assets/music',
  qa: 'qa', previews: 'out', exports: 'out',
  voiceCache: 'audio/vo', voiceWav: 'audio/voiceover.wav', premix: 'audio/.premix.wav', timing: 'audio/timing.json',
  captionsDir: 'audio', mix: 'audio/mix.wav',
  build: '.build', render: '.build/render', manifest: '.build/render/manifest.json',
  edit: 'edit', editVideo: 'edit/video', editOverlay: 'edit/overlay', editAudio: 'edit/audio',
  editVoice: 'edit/audio/voice', editSfx: 'edit/audio/sfx', editMusic: 'edit/audio/music.wav'
};

const LAYOUTS = { 1: V1 };

/** Absolute paths for a project (and the same paths relative to it under `.rel`). */
export function projectPaths(dir, sb) {
  if (!sb) {
    try { sb = JSON.parse(fs.readFileSync(path.join(dir, 'storyboard.json'), 'utf8')); } catch { sb = {}; }
  }
  const layout = layoutOf(sb);
  const r = { ...LAYOUTS[layout] };
  r.captions = { json: `${r.captionsDir}/captions.json`, srt: `${r.captionsDir}/captions.srt`, vtt: `${r.captionsDir}/captions.vtt` };
  const abs = (p) => path.join(dir, p);
  const out = { dir, layout, rel: r };
  for (const [k, v] of Object.entries(r)) out[k] = typeof v === 'string' ? abs(v) : Object.fromEntries(Object.entries(v).map(([a, b]) => [a, abs(b)]));
  return out;
}
