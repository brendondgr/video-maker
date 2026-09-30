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
import { parseHex, contrastReport } from './lib/color.mjs';
import { projectPaths } from './lib/paths.mjs';

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

  // look: every video is art-directed for its own subject; there is no house palette.
  const style = sb.style || {}, pal = style.palette || {}, look = style.look || {};
  const missing = ['bg', 'ink', 'accent'].filter((k) => !parseHex(pal[k]));
  if (missing.length) add('error', 'LOOK', `no look chosen: style.palette lacks ${missing.join(', ')}. Choose one for this video (motion-design.md § Choosing a look; design.mjs)`);
  else {
    if (!look.name || !look.why) add('warn', 'LOOK', 'style.look needs a name and a why: the reason this look fits this video (design.mjs --look … --why …)');
    if (/^#0b0f17$/i.test(pal.bg) && /^#5eb0ff$/i.test(pal.accent) && !look.name)
      add('warn', 'LOOK', 'palette is the old built-in navy + #5eb0ff. Keep it only if it was chosen for this video; otherwise pick a look');
    for (const r of contrastReport(pal)) if (!r.ok) add('warn', 'CONTRAST', `--c-${r.token} ${pal[r.token]} is ${r.ratio.toFixed(1)}:1 on bg ${pal.bg} (needs ${r.min}:1)`);
    const known = new Set(Object.values(pal).concat(Object.values(style.roles || {}).map((r) => r && r.color)).filter(Boolean).map((v) => String(v).toLowerCase()));
    const stray = [...new Set((sb.images?.style || '').match(/#[0-9a-f]{6}\b/gi) || [])].filter((h) => !known.has(h.toLowerCase()));
    if (stray.length) add('warn', 'LOOK', `images.style names ${stray.join(', ')}, which are not in this video's palette or roles; illustrations will not match the look`);
  }
  if (c.background && parseHex(pal.bg) && c.background.toLowerCase() !== pal.bg.toLowerCase())
    add('warn', 'LOOK', `canvas.background ${c.background} overrides palette.bg ${pal.bg}; drop it or make them match`);

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

    // Narration density (a rough pre-synthesis check; voiceover.mjs measures the real thing).
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
      if (!/^https?:/.test(a) && !fs.existsSync(path.join(dir, a))) {
        const planned = (sb.images?.items || []).some((it) => a === `assets/img/${it.name}.jpg`);
        add('error', 'ASSET', `missing asset ${a}${planned ? ' (a planned illustration: run images.mjs)' : ''}`, at);
      }
    }
  });

  // Voice-over: once narration is synthesized (voiceover.mjs), every scene must be long enough
  // for its clip, and the mix must be newer than the last storyboard edit.
  const P = projectPaths(dir, sb);
  const timingFile = P.timing;
  if (vo && fs.existsSync(timingFile)) {
    const { requiredDuration } = await import('./lib/audio.mjs');
    const timing = await readJSON(timingFile);
    scenes.forEach((s, i) => {
      const c = timing.scenes?.[s.id];
      if (s.narration && !c) add('warn', 'VOICE_STALE', 'narration not synthesized yet — run voiceover.mjs', { scene: s.id });
      if (c && +s.duration + 1e-3 < requiredDuration(sb, i, c.duration)) {
        add('error', 'NARRATION_CUT', `scene is ${s.duration}s but its ${c.duration.toFixed(2)}s narration needs ${requiredDuration(sb, i, c.duration).toFixed(2)}s — re-run voiceover.mjs (retime)`, { scene: s.id });
      }
    });
    const mix = P.mix;
    if (!fs.existsSync(mix)) add('warn', 'MIX', `${P.rel.mix} missing — run voiceover.mjs`);
    else if (fs.statSync(mix).mtimeMs + 1000 < fs.statSync(path.join(dir, 'storyboard.json')).mtimeMs) add('warn', 'MIX', 'storyboard.json changed after the last mix — re-run voiceover.mjs');
  } else if (vo && !planOnly) add('warn', 'VOICE_STALE', 'voice-over enabled but not synthesized yet — run voiceover.mjs');

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
  await writeJSON(path.join(projectPaths(dir).qa, 'storyboard.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 1 · storyboard', res.findings);
  process.exit(n.error ? 1 : 0);
}
