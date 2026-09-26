#!/usr/bin/env node
// Gate 1 — plan validation. Checks storyboard.json for structural and editorial problems
// before any animation code is judged.
//
//   node validate-storyboard.mjs <project> [--plan-only] [--json]
//
// --plan-only skips the "scene file exists" checks (use it right after storyboarding).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, ENGINE_DIR, fmtTime, isMain } from './lib/common.mjs';

export async function validateStoryboard(dir, { planOnly = false } = {}) {
  const F = [];
  const add = (level, code, msg, extra = {}) => F.push({ level, code, msg, ...extra });
  let sb;
  try { sb = await readJSON(path.join(dir, 'storyboard.json')); }
  catch (e) { add('error', 'JSON', 'storyboard.json is not valid JSON: ' + e.message); return { findings: F }; }
  const catalog = await readJSON(path.join(ENGINE_DIR, 'catalog.json'));

  // meta
  const meta = sb.meta || {};
  if (!meta.title) add('warn', 'META', 'meta.title is empty');
  if (!['directed', 'open'].includes(meta.mode)) add('warn', 'META', 'meta.mode should be "directed" or "open"');
  if (!meta.goal) add('warn', 'META', 'meta.goal is empty — state what the viewer should know or feel at the end');
  if (!meta.audience) add('info', 'META', 'meta.audience is empty');

  // canvas
  const c = sb.canvas || {};
  for (const k of ['width', 'height']) {
    if (!Number.isInteger(c[k]) || c[k] < 16) add('error', 'CANVAS', `canvas.${k} must be a positive integer`);
    else if (c[k] % 2) add('error', 'CANVAS', `canvas.${k} must be even (H.264 requires even dimensions)`);
  }
  if (!(c.fps >= 12 && c.fps <= 120)) add('error', 'CANVAS', 'canvas.fps must be between 12 and 120');
  if (c.safe_area != null && !(c.safe_area >= 0 && c.safe_area <= 0.2)) add('warn', 'CANVAS', 'canvas.safe_area should be between 0 and 0.2');

  // scenes
  const scenes = Array.isArray(sb.scenes) ? sb.scenes : [];
  if (!scenes.length) add('error', 'SCENES', 'storyboard has no scenes');
  const ids = new Set();
  let cursor = 0;
  const minDur = sb.rules?.min_scene_duration ?? 1.5;
  const maxDur = sb.rules?.max_scene_duration ?? 20;
  const maxWps = sb.rules?.max_words_per_second ?? 3.2;
  const vo = sb.audio?.voiceover?.enabled;
  scenes.forEach((s, i) => {
    const at = { scene: s.id || `#${i}` };
    if (!s.id || !/^[a-z0-9][a-z0-9_-]*$/.test(s.id)) add('error', 'SCENE_ID', 'id must be lowercase kebab/snake case', at);
    if (ids.has(s.id)) add('error', 'SCENE_ID', 'duplicate scene id', at);
    ids.add(s.id);
    const d = +s.duration;
    if (!(d > 0)) { add('error', 'DURATION', 'duration must be > 0 seconds', at); return; }
    if (d < minDur) add('warn', 'DURATION', `only ${d}s — too short to register (min ${minDur}s)`, at);
    if (d > maxDur) add('warn', 'DURATION', `${d}s is long for one scene — split it or make sure something moves the whole time`, at);
    if (!s.purpose) add('warn', 'PURPOSE', 'no purpose — every scene must earn its place (what does the viewer learn here?)', at);
    const vt = s.visual?.type;
    if (!vt) add('error', 'VISUAL', 'visual.type is required', at);
    else if (!catalog.types[vt]) add('warn', 'VISUAL', `visual.type "${vt}" is not in catalog.json (use "custom" or add it)`, at);
    if (vt === 'custom' && !s.visual?.notes) add('warn', 'VISUAL', 'custom visual needs visual.notes describing it', at);

    // Reading load: on-screen words must be readable in the time available.
    const text = [].concat(s.on_screen_text || []).join(' ');
    const words = text.split(/\s+/).filter(Boolean).length;
    const readable = Math.max(0.5, d - 1.0);
    if (words / readable > maxWps * 1.4) add('error', 'READING', `${words} words in ${d}s (${(words / readable).toFixed(1)} w/s) — unreadable; cut text or lengthen`, at);
    else if (words / readable > maxWps) add('warn', 'READING', `${words} words in ${d}s (${(words / readable).toFixed(1)} w/s) — tight`, at);

    // Narration is reserved for the TTS phase; when enabled it drives pacing.
    if (s.narration) {
      const nw = s.narration.split(/\s+/).filter(Boolean).length;
      const wps = nw / d;
      if (vo && wps > 2.9) add('warn', 'NARRATION', `${nw} narration words in ${d}s (${wps.toFixed(1)} w/s > 2.9) — voice-over will overrun`, at);
    }

    // Beats
    const beats = s.beats || [];
    let last = -1; const bids = new Set();
    beats.forEach((b) => {
      if (typeof b.t !== 'number' || b.t < 0 || b.t > d) add('error', 'BEAT', `beat ${b.id || ''} t=${b.t} outside 0..${d}`, at);
      if (b.t < last) add('warn', 'BEAT', `beats out of order at ${b.id || b.t}`, at);
      if (b.id) { if (bids.has(b.id)) add('error', 'BEAT', `duplicate beat id "${b.id}"`, at); bids.add(b.id); }
      last = b.t;
    });

    // Transitions
    const tr = s.transition_in;
    let overlap = 0;
    if (tr && i > 0) {
      if (!catalog.transitions.includes(tr.type)) add('warn', 'TRANSITION', `unknown transition "${tr.type}" (runtime may define custom ones)`, at);
      overlap = Math.min(+tr.duration || 0, d, +scenes[i - 1].duration || 0);
      if ((+tr.duration || 0) > Math.min(d, +scenes[i - 1].duration || 0) * 0.5) add('warn', 'TRANSITION', 'transition longer than half of a neighbouring scene', at);
    }
    cursor = Math.max(0, cursor - overlap) + d;

    // Files
    if (!planOnly) {
      const f = path.join(dir, s.module || `scenes/${s.id}.js`);
      if (!fs.existsSync(f)) add('error', 'SCENE_FILE', `missing ${path.relative(dir, f)}`, at);
    }
    for (const a of s.assets || []) {
      if (!/^https?:/.test(a) && !fs.existsSync(path.join(dir, a))) add('error', 'ASSET', `missing asset ${a}`, at);
    }
  });

  // Orphan scene files
  if (!planOnly && fs.existsSync(path.join(dir, 'scenes'))) {
    const used = new Set(scenes.map((s) => path.normalize(s.module || `scenes/${s.id}.js`)));
    for (const f of fs.readdirSync(path.join(dir, 'scenes'))) {
      if (f.endsWith('.js') && !f.startsWith('_') && !used.has(path.normalize('scenes/' + f))) add('warn', 'ORPHAN', `scenes/${f} is not referenced by the storyboard`);
    }
  }

  // Total length vs target
  const total = cursor;
  if (sb.target_duration) {
    const tgt = +sb.target_duration;
    const tol = Math.max(2, tgt * (sb.rules?.duration_tolerance ?? 0.1));
    if (Math.abs(total - tgt) > tol) add('warn', 'LENGTH', `timeline is ${fmtTime(total)} but target is ${fmtTime(tgt)} (±${tol.toFixed(1)}s)`);
  }
  add('info', 'LENGTH', `${scenes.length} scenes, total ${fmtTime(total)} at ${c.width}×${c.height} ${c.fps}fps`);
  return { findings: F, total, scenes: scenes.length };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const res = await validateStoryboard(dir, { planOnly: !!args['plan-only'] });
  await writeJSON(path.join(dir, 'qa', 'storyboard.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 1 · storyboard', res.findings);
  process.exit(n.error ? 1 : 0);
}
