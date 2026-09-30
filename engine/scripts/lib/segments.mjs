// The edit package's clip plan and render cache.
//
// clipPlan(sb, fps, handles) lays the video out as editor tracks, in whole frames:
//   V1 scene  i   timeline [Sᵢ, Sᵢ₊₁)        media: scene i rendered alone, padded by H held
//                                            frames each side (handles); source starts at H
//   V2 trans  i   timeline [Sᵢ, Eᵢ₋₁)        media: the whole video over the overlap, no overlays
//   V3 layer      timeline [0, T)            media: overlays only (captions…), with alpha
// Boundaries are rounded to the nearest frame, so rounding never accumulates. V2 covers every
// overlap, so a solo scene's missing transition animation is never seen.
//
// fingerprint() decides when a clip must be re-rendered: a SHA-1 over everything that can
// change its pixels. When unsure an input is included: a spurious re-render is cheap, a stale
// clip is a bug.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { sceneTimes, timelineTotal } from './hf.mjs';
import { projectPaths } from './paths.mjs';

export const EDIT_DEFAULTS = { codec: 'prores', handles: 1 };

// Codecs for edit media. ProRes decodes in every target editor on every OS (DaVinci Resolve free
// on Linux cannot decode H.264); h264i is all-intra H.264, much smaller.
export const EDIT_CODECS = {
  'prores':    { ext: '.mov', argv: ['-c:v', 'prores_ks', '-profile:v', '2', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'] },
  'prores-hq': { ext: '.mov', argv: ['-c:v', 'prores_ks', '-profile:v', '3', '-pix_fmt', 'yuv422p10le', '-vendor', 'apl0'] },
  'dnxhr':     { ext: '.mov', argv: ['-c:v', 'dnxhd', '-profile:v', 'dnxhr_hq', '-pix_fmt', 'yuv422p'] },
  'h264i':     { ext: '.mp4', argv: ['-c:v', 'libx264', '-crf', '12', '-preset', 'medium', '-g', '1', '-pix_fmt', 'yuv420p'] }
};
export const ALPHA_CODEC = { ext: '.mov', argv: ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le', '-alpha_bits', '16', '-vendor', 'apl0'] };

export function editSettings(sb, args = {}) {
  const e = Object.assign({}, EDIT_DEFAULTS, sb.edit || {});
  if (args['edit-codec']) e.codec = String(args['edit-codec']);
  if (args.handles != null) e.handles = +args.handles;
  if (!EDIT_CODECS[e.codec]) throw new Error(`edit codec must be one of ${Object.keys(EDIT_CODECS).join(', ')}`);
  return e;
}

/** Overlays the composition will draw (captions count only when their data exists). */
export function overlayNames(sb, dir) {
  const names = (sb.overlays || []).map((o) => (typeof o === 'string' ? o : o.name));
  if (sb.audio?.captions?.enabled && fs.existsSync(projectPaths(dir, sb).captions.json)) names.push('captions');
  return names;
}

export function clipPlan(sb, dir, { fps = sb.canvas?.fps || 30, handles = EDIT_DEFAULTS.handles, codec = EDIT_DEFAULTS.codec, scale = 1 } = {}) {
  const P = projectPaths(dir, sb);
  const ext = EDIT_CODECS[codec].ext;
  const times = sceneTimes(sb);
  const F = (t) => Math.round(t * fps);
  const S = times.map((t) => F(t.start)), E = times.map((t) => F(t.end));
  const total = F(timelineTotal(sb));
  const H = Math.round(handles * fps);
  const scenes = [], transitions = [], pieces = [];
  times.forEach((t, i) => {
    const len = E[i] - S[i];
    const tlEnd = i < times.length - 1 ? S[i + 1] : E[i];
    scenes.push({
      kind: 'scene', id: t.id, index: i, file: path.join(P.editVideo, t.id + ext),
      render: { frames: len, handles: H },            // solo local frames 0…len−1, then ±H held
      media: { frames: len + 2 * H },
      timeline: { start: S[i], end: tlEnd }, source: { start: H, frames: tlEnd - S[i] }
    });
    if (i > 0 && E[i - 1] > S[i]) {
      transitions.push({
        kind: 'transition', id: `${times[i - 1].id}__${t.id}`, from: times[i - 1].id, to: t.id, index: i,
        file: path.join(P.editVideo, `${times[i - 1].id}__${t.id}${ext}`),
        render: { start: S[i], frames: E[i - 1] - S[i] }, media: { frames: E[i - 1] - S[i] },
        timeline: { start: S[i], end: E[i - 1] }, source: { start: 0, frames: E[i - 1] - S[i] }
      });
    }
  });
  // The picture as a plain sequence: each scene's uncovered middle, then the transition after it.
  scenes.forEach((s, i) => {
    const a = i > 0 ? Math.max(S[i], E[i - 1]) : 0;
    const b = s.timeline.end;
    if (b > a) pieces.push({ file: s.file, source: s.source.start + (a - S[i]), frames: b - a, at: a });
    const tr = transitions.find((x) => x.index === i + 1);
    if (tr) pieces.push({ file: tr.file, source: 0, frames: tr.media.frames, at: tr.timeline.start });
  });
  const names = overlayNames(sb, dir);
  const overlay = names.length ? {
    kind: 'overlay', id: 'captions', names, file: path.join(P.editOverlay, 'captions' + ALPHA_CODEC.ext),
    render: { start: 0, frames: total }, media: { frames: total }, timeline: { start: 0, end: total }, source: { start: 0, frames: total }
  } : null;
  return { fps, handles: H, codec, scale, total, scenes, transitions, overlay, pieces };
}

// ------------------------------------------------------------------ fingerprints
const sha = (...parts) => { const h = crypto.createHash('sha1'); for (const p of parts) h.update(typeof p === 'string' || Buffer.isBuffer(p) ? p : JSON.stringify(p ?? null)).update('␟'); return h.digest('hex'); };
const readOr = (f) => { try { return fs.readFileSync(f); } catch { return ''; } };
const walk = (d) => { try { return fs.readdirSync(d, { recursive: true }).map((f) => path.join(d, f)).filter((f) => fs.statSync(f).isFile()).sort(); } catch { return []; } };
let runtimeHash = null;

/** Everything shared by all clips: the page, its styles and scripts, the engine runtime. */
export function sharedInputs(sb, dir, settings) {
  if (!runtimeHash) {
    const engine = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..');
    runtimeHash = sha(...walk(path.join(engine, 'runtime')).map((f) => readOr(f)), readOr(path.join(engine, 'fonts.css')));
  }
  // index.html's root attributes (duration, the mix <audio>) change with every retime; strip them.
  const html = String(readOr(path.join(dir, 'index.html'))).replace(/<div\s+id="stage"[^>]*>[\s\S]*?<\/div>/, '');
  const scripts = (sb.assets?.scripts || []).filter((s) => !/^https?:|^\/_engine\//.test(s)).map((s) => readOr(path.join(dir, s)));
  const lib = walk(path.join(dir, 'lib')).map((f) => [path.relative(dir, f), readOr(f)]).flat();
  return sha(runtimeHash, html, readOr(path.join(dir, 'style.css')), ...scripts, ...lib, sb.style, sb.canvas, sb.assets, settings.codec, settings.fps, settings.scale);
}

// Asset paths a scene names ('assets/img/city.jpg', "assets/…"), hashed by content.
function assetsNamed(text, dir) {
  const found = new Set(String(text).match(/assets\/[\w./-]+\.\w+/g) || []);
  return [...found].sort().map((a) => [a, readOr(path.join(dir, a))]).flat();
}

const NON_VISUAL = new Set(['narration', 'voice', 'sfx', 'silent', 'purpose']);
const visualSpec = (s) => Object.fromEntries(Object.entries(s).filter(([k]) => !NON_VISUAL.has(k)));

export function fingerprints(sb, dir, plan) {
  const shared = sharedInputs(sb, dir, { codec: plan.codec, fps: plan.fps, scale: plan.scale });
  const out = {};
  const sceneKey = {};
  for (const s of plan.scenes) {
    const spec = sb.scenes[s.index];
    const code = readOr(path.join(dir, spec.module || `scenes/${spec.id}.js`));
    sceneKey[s.id] = sha('scene', shared, code, visualSpec(spec), assetsNamed(code + JSON.stringify(spec), dir), s.render, plan.handles);
    out[s.file] = sceneKey[s.id];
  }
  for (const t of plan.transitions) {
    // Keyed by where the window sits inside the outgoing scene, not by absolute time, so a
    // retime earlier in the video doesn't invalidate it.
    const prev = plan.scenes[t.index - 1];
    out[t.file] = sha('transition', sceneKey[t.from], sceneKey[t.to], sb.scenes[t.index].transition_in, t.render.frames, t.render.start - prev.timeline.start);
  }
  if (plan.overlay) {
    const P = projectPaths(dir, sb);
    out[plan.overlay.file] = sha('overlay', shared, readOr(P.captions.json), sb.overlays, sb.audio?.captions, plan.overlay.render);
  }
  return out;
}

// ------------------------------------------------------------------ manifest
export function readManifest(dir, sb) {
  try { return JSON.parse(fs.readFileSync(projectPaths(dir, sb).manifest, 'utf8')); } catch { return { version: 1, clips: {} }; }
}
export function writeManifest(dir, sb, m) {
  const f = projectPaths(dir, sb).manifest;
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(m, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

/** Every planned clip with its fingerprint and whether it must be (re-)rendered. */
export function planStatus(sb, dir, settings) {
  const plan = clipPlan(sb, dir, settings);
  const keys = fingerprints(sb, dir, plan);
  const m = readManifest(dir, sb);
  const items = [...plan.scenes, ...plan.transitions, ...(plan.overlay ? [plan.overlay] : [])];
  for (const it of items) {
    const rel = path.relative(dir, it.file);
    it.key = keys[it.file];
    it.stale = !(m.clips[rel]?.key === it.key && fs.existsSync(it.file));
  }
  return { plan, items, manifest: m };
}
