#!/usr/bin/env node
// Move a layout-1 project (brief.md, audio/, qa/, out/ at the root) to layout 2 (docs/, edit/,
// exports/, .build/; see lib/paths.mjs). Idempotent: a second run is a no-op.
//
//   node migrate-layout.mjs <project> [--dry-run]
//
// Nothing is overwritten: when the target already exists the file is left where it is and
// reported. Files the map doesn't know (e.g. your own files in audio/) stay put and are listed.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, readJSON, writeJSON } from './lib/common.mjs';
import { projectPaths, LATEST_LAYOUT } from './lib/paths.mjs';
import { syncProject } from './lib/hf.mjs';
import { writeReadme } from './lib/readme.mjs';

const args = parseArgs();
const dir = path.resolve(args._[0] || '.');
const dry = !!args['dry-run'];
const sbPath = path.join(dir, 'storyboard.json');
if (!fs.existsSync(sbPath)) { console.error(`no storyboard.json in ${dir}`); process.exit(2); }
const sb = await readJSON(sbPath);
const from = projectPaths(dir, { ...sb, meta: { ...sb.meta, layout: 1 } });
const to = projectPaths(dir, { ...sb, meta: { ...sb.meta, layout: LATEST_LAYOUT } });
const slug = (sb.meta?.slug || sb.meta?.title || path.basename(dir)).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ids = (sb.scenes || []).map((s) => s.id);

const moves = [];   // [src, dst]
const add = (src, dst) => { if (fs.existsSync(src) && fs.statSync(src).isFile()) moves.push([src, dst]); };
const addDir = (src, dst, pick = () => dst) => {
  if (!fs.existsSync(src)) return;
  for (const f of fs.readdirSync(src, { recursive: true })) {
    const p = path.join(src, f);
    if (fs.statSync(p).isFile()) moves.push([p, path.join(pick(f), f)]);
  }
};

add(from.brief, to.brief); add(from.plan, to.plan); add(from.script, to.script);
add(path.join(dir, 'design.md'), path.join(to.docs, 'design.md'));
addDir(from.voiceCache, to.voiceCache);
add(from.voiceWav, to.voiceWav); add(from.premix, to.premix); add(from.timing, to.timing);
for (const k of ['json', 'srt', 'vtt']) add(from.captions[k], to.captions[k]);
add(from.mix, to.mix);
addDir(from.qa, to.qa);
// out/: a whole-video render is an export; a scene/range/draft render is a preview.
const preview = (f) => /-draft\./.test(f) || /-\d+\.\d-\d+\.\d-/.test(f) || ids.some((id) => f.startsWith(`${slug}-${id}-`));
addDir(from.exports, null, (f) => (preview(f) ? to.previews : to.exports));

const rel = (p) => path.relative(dir, p);
let moved = 0, kept = 0;
for (const [src, dst] of moves) {
  if (path.resolve(src) === path.resolve(dst)) continue;
  if (fs.existsSync(dst)) { console.log(`  ▲ keep  ${rel(src)}  (${rel(dst)} already exists)`); kept++; continue; }
  console.log(`  ${dry ? '·' : '→'} ${rel(src)}  →  ${rel(dst)}`);
  if (!dry) { await fsp.mkdir(path.dirname(dst), { recursive: true }); await fsp.rename(src, dst); }
  moved++;
}

// timing.json records each clip's path; point it at the moved cache.
if (!dry && fs.existsSync(to.timing)) {
  const t = await readJSON(to.timing);
  let changed = false;
  for (const s of Object.values(t.scenes || {})) {
    if (s.file && s.file.startsWith(from.rel.voiceCache + '/')) { s.file = to.rel.voiceCache + s.file.slice(from.rel.voiceCache.length); changed = true; }
  }
  if (changed) await writeJSON(to.timing, t);
}

// Remove v1 folders that are now empty; list anything left behind.
const leftovers = [], planned = new Set(moves.map(([s]) => path.resolve(s)));
for (const d of [from.voiceCache, path.join(dir, 'audio'), from.qa, from.exports]) {
  if (!fs.existsSync(d)) continue;
  const rest = fs.readdirSync(d, { recursive: true }).filter((f) => fs.statSync(path.join(d, f)).isFile() && !(dry && planned.has(path.resolve(d, f))));
  if (!rest.length) { if (!dry) await fsp.rm(d, { recursive: true, force: true }); }
  else leftovers.push(...rest.map((f) => rel(path.join(d, f))));
}

const already = (+sb.meta?.layout || 1) >= LATEST_LAYOUT;
if (!dry && !already) {
  sb.meta = { layout: LATEST_LAYOUT, ...sb.meta, layout: LATEST_LAYOUT };
  await writeJSON(sbPath, sb);
}
if (!dry) {
  for (const d of [to.docs, to.edit, to.exports]) await fsp.mkdir(d, { recursive: true });
  syncProject(dir);   // HyperFrames <audio> now points at edit/audio/mix.wav
  writeReadme(dir);
}
console.log(`${dry ? '(dry run) ' : ''}${moved ? `✔ ${dry ? 'would move' : 'moved'} ${moved} file(s)` : '✔ nothing to move'}` +
  `${kept ? `, kept ${kept} (target exists)` : ''} · layout ${already ? `${LATEST_LAYOUT} (already)` : dry ? `1 → ${LATEST_LAYOUT}` : LATEST_LAYOUT}`);
if (leftovers.length) console.log(`  ▲ left in place (not part of the layout): ${leftovers.join(', ')}`);
