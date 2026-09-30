// Every file a project reads or writes, in one place.
//
//   const P = projectPaths(dir[, sb]);   P.mix, P.qa, P.captions.json, P.rel.mix, …
//
// Layout 1 is the original flat layout (brief.md, audio/, qa/, out/ at the project root).
// Layout 2 (storyboard.meta.layout = 2, what new-project.mjs creates) has three zones:
//   author    the composition at the root (storyboard.json, index.html, style.css, scenes/,
//             lib/), docs/ (brief, plan, script) and assets/ (inputs only)
//   hand-off  edit/ (per-scene clips, stems, captions, the .otio timeline) and exports/
//   disposable .build/ (caches, QA output, previews): safe to delete at any time
// Scripts pick the layout from storyboard.meta.layout, so old projects keep working unchanged;
// migrate-layout.mjs converts one. The runtime mirrors the captions path in runtime/boot.js.
import fs from 'node:fs';
import path from 'node:path';

export const LATEST_LAYOUT = 2;

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

const V2 = {
  ...V1,
  docs: 'docs', brief: 'docs/brief.md', plan: 'docs/PLAN.md', script: 'docs/SCRIPT.md',
  qa: '.build/qa', previews: '.build/previews', exports: 'exports',
  voiceCache: '.build/voice/cache', voiceWav: '.build/voice/voiceover.wav', premix: '.build/voice/premix.wav',
  timing: '.build/voice/timing.json',
  captionsDir: 'edit/captions', mix: 'edit/audio/mix.wav'
};

const LAYOUTS = { 1: V1, 2: V2 };

/** The project's file-name slug. */
export function slugOf(sb, dir) {
  return (sb?.meta?.slug || sb?.meta?.title || path.basename(dir || '')).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
}

/**
 * File name of a finished (whole-video) export. Layout 2: `<slug>.mp4`, `<slug>-4k.mp4`, plus
 * `-<fps>fps` only when it differs from the canvas and `-hf` for the HyperFrames engine.
 * Layout 1 keeps the old `<slug>-<W>x<H>-<fps>fps` names.
 */
export function exportName(sb, dir, { width, height, fps, scale = 1, ext = '.mp4', engine = 'vm' }) {
  const slug = slugOf(sb, dir);
  if (layoutOf(sb) < 2) return `${slug}-${width}x${height}-${fps}fps${engine === 'hf' ? '-hf' : ''}${ext}`;
  const canvasFps = +(sb?.canvas?.fps || 30);
  return `${slug}${scale === 2 ? '-4k' : ''}${fps !== canvasFps ? `-${fps}fps` : ''}${engine === 'hf' ? '-hf' : ''}${ext}`;
}

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
