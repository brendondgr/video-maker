#!/usr/bin/env node
// Gate 2 — static lint of scene code for anything that breaks deterministic, seekable rendering.
//
//   node lint.mjs <project> [--json]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, isMain } from './lib/common.mjs';

const RULES = [
  { re: /\bMath\.random\s*\(/, level: 'error', code: 'RANDOM', msg: 'Math.random — use ctx.random() (seeded per scene)' },
  { re: /\b(Date\.now|performance\.now)\s*\(|new\s+Date\s*\(\s*\)/, level: 'error', code: 'WALLCLOCK', msg: 'wall-clock time — derive everything from timeline time (onFrame local t)' },
  { re: /\b(setTimeout|setInterval|requestAnimationFrame)\s*\(/, level: 'error', code: 'TIMER', msg: 'timers/rAF do not run during frame-by-frame rendering — put the change on ctx.tl or in ctx.onFrame' },
  { re: /\bgsap\.(to|from|fromTo)\s*\(/, level: 'error', code: 'FREE_TWEEN', msg: 'free-running gsap tween — use ctx.tl.to/from/fromTo so the renderer can seek it' },
  { re: /\bgsap\.timeline\s*\(/, level: 'warn', code: 'SUB_TIMELINE', msg: 'nested timeline — make sure it is added with ctx.tl.add(sub, at)' },
  { re: /\.transition\s*\(/, level: 'error', code: 'D3_TRANSITION', msg: 'd3 transitions are wall-clock driven — tween a proxy on ctx.tl and redraw in ctx.onFrame' },
  { re: /repeat\s*:\s*-1/, level: 'error', code: 'INFINITE', msg: 'repeat: -1 makes the timeline infinite — use a finite repeat that fits the scene' },
  { re: /\b(onComplete|onStart|onUpdate|onRepeat|onReverseComplete)\s*:/, level: 'warn', code: 'CALLBACK', msg: 'tween callbacks are suppressed while seeking — use ctx.onFrame instead' },
  { re: /\.call\s*\(\s*(function|\(|[a-zA-Z_$][\w$]*\s*,)/, level: 'warn', code: 'CALLBACK', msg: 'timeline .call() is suppressed while seeking — use ctx.onFrame instead' },
  { re: /\.play\s*\(\s*\)|<video\b|createElement\(\s*['"]video/, level: 'warn', code: 'MEDIA', msg: '<video>/<audio> playback is not frame-synced — seek media per frame in onFrame (video.currentTime = t) or use image sequences' },
  { re: /https?:\/\/(?!www\.w3\.org)/, level: 'warn', code: 'EXTERNAL', msg: 'external URL — vendor the asset into assets/ so renders work offline and never change' },
  { re: /(['"`])(?:(?!\1).)*?(?<!\\)\\[;,!: ](?:(?!\1).)*\1/, level: 'warn', code: 'ESCAPE', msg: 'single backslash before ; , ! : or space inside a JS string is silently dropped — write \\\\ for KaTeX (e.g. "\\\\;")' },
  { re: /\bforceSimulation\b(?![\s\S]{0,400}\.stop\(\))/, level: 'error', code: 'LIVE_SIM', msg: 'live d3-force simulation — call .stop() and tick() synchronously at build (or use VMX.network)' }
];
const CSS_RULES = [
  { re: /@keyframes|\banimation\s*:/, level: 'error', code: 'CSS_ANIM', msg: 'CSS animations are wall-clock driven — animate with GSAP on ctx.tl' },
  { re: /\btransition\s*:/, level: 'warn', code: 'CSS_TRANSITION', msg: 'CSS transitions are disabled in render mode — remove or move to GSAP' },
  { re: /@import\s+url\(\s*['"]?https?:/, level: 'warn', code: 'EXTERNAL', msg: 'remote stylesheet/font — vendor it locally for offline, deterministic renders' }
];

function scan(file, rules, rel) {
  const out = [];
  const src = fs.readFileSync(file, 'utf8');
  const lines = src.split('\n');
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const sl = stripped.split('\n');
  for (const r of rules) {
    // multi-line rule (lookahead across lines) runs on the whole file
    if (r.code === 'LIVE_SIM') {
      const m = r.re.exec(stripped);
      if (m) out.push({ level: r.level, code: r.code, msg: `${rel}:${stripped.slice(0, m.index).split('\n').length} ${r.msg}` });
      continue;
    }
    sl.forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '');
      if (/vm-lint-disable/.test(lines[i])) return;
      if (r.re.test(code)) out.push({ level: r.level, code: r.code, msg: `${rel}:${i + 1} ${r.msg}` });
    });
  }
  return { out, src };
}

export async function lint(dir) {
  const F = [];
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const files = new Set();
  for (const s of sb.scenes || []) files.add(s.module || `scenes/${s.id}.js`);
  for (const s of sb.assets?.scripts || []) if (!/^https?:|^\/_engine\//.test(s)) files.add(s);
  const idsByFile = {};
  for (const s of sb.scenes || []) (idsByFile[s.module || `scenes/${s.id}.js`] ||= []).push(s.id);

  for (const rel of files) {
    const f = path.join(dir, rel);
    if (!fs.existsSync(f)) { F.push({ level: 'error', code: 'MISSING', msg: `${rel} not found` }); continue; }
    const { out, src } = scan(f, RULES, rel);
    F.push(...out);
    for (const id of idsByFile[rel] || []) {
      const re = new RegExp(`VM\\.scene\\(\\s*['"\`]${id}['"\`]`);
      if (!re.test(src)) F.push({ level: 'error', code: 'REGISTER', scene: id, msg: `${rel} never calls VM.scene('${id}', ...)` });
    }
    if (/\bctx\.tl\.(to|from|fromTo|set)\(\s*ctx\.el\b/.test(src)) {
      F.push({ level: 'warn', code: 'SCENE_ROOT', msg: `${rel} animates ctx.el directly — transitions also animate it; animate an inner wrapper instead` });
    }
  }
  for (const css of ['style.css']) {
    const f = path.join(dir, css);
    if (fs.existsSync(f)) F.push(...scan(f, CSS_RULES, css).out);
  }
  if (!F.some((f) => f.level !== 'info')) F.push({ level: 'info', code: 'OK', msg: `${files.size} file(s) clean` });
  return { findings: F };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const res = await lint(dir);
  await writeJSON(path.join(dir, 'qa', 'lint.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 2 · lint', res.findings);
  process.exit(n.error ? 1 : 0);
}
