// HyperFrames interop: keep every project a valid HyperFrames composition.
//
// A video-maker project becomes renderable/lintable by the `hyperframes` CLI when
//   1. `_engine` inside the project points at this engine (so relative asset paths resolve
//      under any static server — HyperFrames serves the project root as-is), and
//   2. the root <div id="stage"> carries static data-composition-id / data-width /
//      data-height / data-duration / data-fps matching storyboard.json (HyperFrames reads the
//      duration once, from the attribute, before any script runs).
// Both are derived state; syncProject() rewrites them whenever a script opens a project.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Not imported from common.mjs: common.mjs imports this module (projectDir → syncProject).
const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export const HF_VERSION = '0.8.77';
export const HF_BIN = path.join(ENGINE_DIR, 'node_modules', '.bin', process.platform === 'win32' ? 'hyperframes.cmd' : 'hyperframes');

/** Same arithmetic as the runtime: Σ durations − Σ transition overlaps. */
export function timelineTotal(sb) {
  let cursor = 0, prev = null;
  for (const [i, s] of (sb.scenes || []).entries()) {
    const d = +s.duration || 0;
    const tr = i === 0 ? 0 : Math.min(+(s.transition_in?.duration) || 0, d, prev);
    cursor = Math.max(0, cursor - tr) + d;
    prev = d;
  }
  return Math.round(cursor * 1000) / 1000;
}

/** Scene start/end times on the master timeline. */
export function sceneTimes(sb) {
  let cursor = 0, prev = null;
  return (sb.scenes || []).map((s, i) => {
    const d = +s.duration || 0;
    const tr = i === 0 ? 0 : Math.min(+(s.transition_in?.duration) || 0, d, prev);
    const start = Math.max(0, cursor - tr);
    cursor = start + d; prev = d;
    return { id: s.id, start, end: cursor, duration: d, transition: tr };
  });
}

function ensureEngineLink(dir) {
  const link = path.join(dir, '_engine');
  let st = null;
  try { st = fs.lstatSync(link); } catch { /* missing */ }
  if (st) {
    if (st.isSymbolicLink()) {
      const cur = path.resolve(dir, fs.readlinkSync(link));
      if (cur === ENGINE_DIR) return;
      fs.unlinkSync(link);
    } else return;                       // a real directory (e.g. a vendored copy): leave it
  }
  // Relative link when possible so the pair can move together; junctions on Windows need no admin.
  const target = process.platform === 'win32' ? ENGINE_DIR : path.relative(dir, ENGINE_DIR);
  fs.symlinkSync(target, link, process.platform === 'win32' ? 'junction' : 'dir');
}

/** Rewrite the HyperFrames root attributes in index.html from the storyboard. */
function syncRootAttributes(dir, sb) {
  const file = path.join(dir, 'index.html');
  if (!fs.existsSync(file)) return;
  const html = fs.readFileSync(file, 'utf8');
  const c = Object.assign({ width: 1920, height: 1080, fps: 30 }, sb.canvas || {});
  const attrs = `id="stage" data-composition-id="main" data-width="${c.width}" data-height="${c.height}" ` +
    `data-duration="${timelineTotal(sb)}" data-fps="${c.fps}"`;
  const next = html.replace(/<div\s+id="stage"[^>]*>/, `<div ${attrs}>`);
  let out = next;
  if (!/__timelines\s*=/.test(out)) {
    out = out.replace(/(\s*)<script src="[^"]*boot\.js"><\/script>/,
      '$1<script>window.__timelines = window.__timelines || {};</script>$&');
  }
  if (out !== html) fs.writeFileSync(file, out);
}

/** Make `dir` a valid HyperFrames composition. Cheap and idempotent. */
export function syncProject(dir) {
  const sbPath = path.join(dir, 'storyboard.json');
  if (!fs.existsSync(sbPath)) return;
  const sb = JSON.parse(fs.readFileSync(sbPath, 'utf8'));
  ensureEngineLink(dir);
  syncRootAttributes(dir, sb);
}

/** Run the pinned hyperframes CLI in a project. Telemetry is off unless asked for. */
export function runHF(dir, argv, { telemetry = false, capture = false } = {}) {
  if (!fs.existsSync(HF_BIN)) {
    throw new Error(`hyperframes CLI not installed — run \`npm install\` in ${ENGINE_DIR}`);
  }
  const env = { ...process.env };
  if (!telemetry) { env.HYPERFRAMES_NO_TELEMETRY = '1'; env.DO_NOT_TRACK = '1'; }
  env.HYPERFRAMES_SKIP_SKILLS = env.HYPERFRAMES_SKIP_SKILLS || '1';
  return new Promise((resolve, reject) => {
    const p = spawn(HF_BIN, argv, { cwd: dir, env, stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      shell: process.platform === 'win32' });
    let out = '', err = '';
    if (capture) { p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d)); }
    p.on('error', reject);
    p.on('close', (code) => resolve({ code, stdout: out, stderr: err }));
  });
}
