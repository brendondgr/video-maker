#!/usr/bin/env node
// Gate 3 — runtime QA in headless Chromium.
//   · boot: page errors, console errors, failed/external requests, missing builders, overruns
//   · determinism: the same time rendered via different seek orders must give identical pixels
//   · layout (sampled per scene): text off-stage / outside safe area / clipped / too small /
//     overlapping / low contrast; blank frames
//   · reading load measured from what is actually on screen
//
//   node check.mjs <project> [--samples 3] [--no-determinism] [--json]
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, serve, launchBrowser, openComposition, isMain, diffImages } from './lib/common.mjs';
import { projectPaths } from './lib/paths.mjs';

export async function check(dir, opts = {}) {
  const F = [];
  const add = (level, code, msg, extra = {}) => F.push({ level, code, msg, ...extra });
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const canvas = Object.assign({ width: 1920, height: 1080, fps: 30, safe_area: 0.05 }, sb.canvas);
  const rules = Object.assign({ min_text_px_ratio: 0.02, max_words_per_second: 3.2 }, sb.rules || {});
  const server = await serve(dir);
  const browser = await launchBrowser(opts);
  const perf = {};
  try {
    const { context, page, info, logs } = await openComposition(browser, server.url, { width: canvas.width, height: canvas.height });
    // ---- boot
    if (!info.ready) { add('error', 'BOOT', 'composition did not start: ' + info.errors.join('; ')); return { findings: F }; }
    info.errors.forEach((e) => add('error', 'RUNTIME', e));
    info.warnings.forEach((w) => add('warn', 'RUNTIME', w));
    logs.pageErrors.forEach((e) => add('error', 'PAGE_ERROR', e));
    logs.console.filter((m) => m.type === 'error').forEach((m) => add('error', 'CONSOLE', m.text.slice(0, 300)));
    logs.failedRequests.forEach((r) => add('error', 'REQUEST', r));
    [...new Set(logs.external)].forEach((u) => add('warn', 'EXTERNAL', 'network request outside the project: ' + u));
    const ids = new Set(info.scenes.map((s) => s.id));
    info.registered.filter((r) => !ids.has(r)).forEach((r) => add('warn', 'UNUSED', `VM.scene('${r}') registered but not in storyboard`));
    if (Math.abs(info.duration * info.fps - Math.round(info.duration * info.fps)) > 1e-6) {
      add('info', 'FRAMES', `duration ${info.duration}s is not a whole number of frames at ${info.fps}fps; last frame rounds`);
    }

    // ---- sample times per scene
    const nS = +(opts.samples || 3);
    const samples = [];
    for (const s of info.scenes) {
      const spec = sb.scenes.find((x) => x.id === s.id) || {};
      const ts = new Set();
      for (let k = 1; k <= nS; k++) ts.add(+(s.start + s.duration * (k / (nS + 1))).toFixed(3));
      // "settled" frame shortly before the scene ends (after entrances, usually before exits)
      ts.add(+(s.start + Math.max(0, s.duration - 0.7)).toFixed(3));
      for (const b of spec.beats || []) ts.add(+(s.start + Math.min(s.duration - 0.05, b.t + 0.8)).toFixed(3));
      [...ts].sort((a, b) => a - b).forEach((t) => samples.push({ scene: s.id, t }));
    }

    // ---- layout audit
    const perEl = new Map();
    const sceneText = {};
    const t0 = Date.now();
    for (const smp of samples) {
      await page.evaluate((t) => window.__vm.seek(t), smp.t);
      const res = await page.evaluate(auditFrame, { safe: canvas.safe_area, minRatio: rules.min_text_px_ratio });
      (sceneText[smp.scene] ||= new Set());
      res.texts.forEach((x) => sceneText[smp.scene].add(x));
      if (res.blank) add('warn', 'BLANK', 'nothing visible on screen', smp);
      for (const iss of res.issues) {
        const key = smp.scene + '|' + iss.code + '|' + iss.sel;
        const e = perEl.get(key) || { ...iss, scene: smp.scene, times: [], total: 0 };
        e.times.push(smp.t);
        perEl.set(key, e);
      }
    }
    perf.seekAuditMs = (Date.now() - t0) / samples.length;
    const perScene = {};
    samples.forEach((s) => (perScene[s.scene] = (perScene[s.scene] || 0) + 1));
    for (const e of perEl.values()) {
      const frac = e.times.length / perScene[e.scene];
      const persistent = frac >= 0.5;
      const sev = { OFFSTAGE: persistent ? 'error' : 'warn', CLIPPED: 'error', UNSAFE: 'warn', TINY_TEXT: persistent ? 'warn' : 'info',
        OVERLAP: persistent ? 'warn' : 'info', CONTRAST: 'warn' }[e.code] || 'warn';
      add(sev, e.code, `${e.sel} — ${e.detail} (${e.times.length}/${perScene[e.scene]} samples)`, { scene: e.scene, t: e.times[0] });
    }
    // reading load from real on-screen text
    for (const s of info.scenes) {
      // Unique word tokens that contain letters: numbers (ticks, counters mid-tween) are glanced, not read.
      const words = new Set([...(sceneText[s.id] || [])].join(' ').toLowerCase().split(/\s+/)
        .map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter((w) => /\p{L}/u.test(w))).size;
      const wps = words / Math.max(0.5, s.duration - 1);
      if (wps > rules.max_words_per_second * 1.4) add('error', 'READING', `~${words} words visible over ${s.duration}s (${wps.toFixed(1)} w/s)`, { scene: s.id });
      else if (wps > rules.max_words_per_second) add('warn', 'READING', `~${words} words visible over ${s.duration}s (${wps.toFixed(1)} w/s)`, { scene: s.id });
    }

    // ---- determinism
    if (opts.determinism !== false) {
      const pick = samples.filter((_, i) => i % Math.max(1, Math.floor(samples.length / 10)) === 0).slice(0, 12);
      const shot = async (t) => {
        await page.evaluate((x) => window.__vm.seek(x), t);
        return page.screenshot({ type: 'png', clip: { x: 0, y: 0, width: canvas.width, height: canvas.height }, animations: 'disabled', caret: 'hide' });
      };
      const t1 = Date.now();
      const fwd = {};
      for (const s of pick) fwd[s.t] = await shot(s.t);
      perf.frameMs = (Date.now() - t1) / pick.length;
      await page.evaluate((x) => window.__vm.seek(x), info.duration);
      let bad = 0;
      for (const s of [...pick].reverse()) {
        const b = await shot(s.t);
        if (crypto.createHash('sha1').update(b).digest('hex') === crypto.createHash('sha1').update(fwd[s.t]).digest('hex')) continue;
        // Tolerate rasteriser noise (a level or two on a handful of pixels); flag real state leaks.
        const d = await diffImages(browser, fwd[s.t], b, { threshold: 8 });
        if (d.fraction > 0.0005) {
          bad++;
          add('error', 'NONDETERMINISTIC', `frame differs depending on seek order: ${(d.fraction * 100).toFixed(2)}% of pixels, max Δ${d.maxDelta}, region ${d.bbox?.join(',')} (state leaking between frames — look for values set outside the timeline)`, s);
        }
      }
      if (!bad) add('info', 'DETERMINISM', `${pick.length} frames identical across forward/backward seeks`);
      const frames = Math.round(info.duration * info.fps);
      add('info', 'PERF', `~${perf.frameMs.toFixed(0)} ms/frame at 1× → ~${Math.ceil(frames * perf.frameMs / 1000)}s for ${frames} frames on one worker`);
    }
    await context.close();
  } finally {
    await browser.close();
    await server.close();
  }
  return { findings: F, perf };
}

// Runs inside the page. Returns issues for the current frame.
function auditFrame({ safe, minRatio }) {
  const stage = document.getElementById('stage');
  const W = stage.offsetWidth, H = stage.offsetHeight;
  const sr = stage.getBoundingClientRect();
  const k = W / sr.width;
  const sx = W * safe, sy = H * safe;
  const minPx = Math.min(W, H) * minRatio;
  const issues = [];
  const texts = [];
  const boxes = [];

  function effOpacity(el) {
    let o = 1;
    for (let n = el; n && n !== stage; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.visibility === 'hidden' || cs.display === 'none') return 0;
      o *= parseFloat(cs.opacity);
    }
    return o;
  }
  function sel(el) {
    const parts = [];
    for (let n = el; n && n !== stage && parts.length < 4; n = n.parentElement) {
      let p = n.tagName.toLowerCase();
      if (n.id) p += '#' + n.id;
      else if (n.classList && n.classList.length) p += '.' + [...n.classList].filter((c) => !/^vm-(word|char|line)/.test(c)).slice(0, 2).join('.');
      if (n.dataset && n.dataset.scene) { parts.unshift(`[${n.dataset.scene}]`); break; }
      parts.unshift(p);
    }
    const t = (el.textContent || '').trim().slice(0, 28);
    return parts.join(' > ') + (t ? ` "${t}${(el.textContent || '').trim().length > 28 ? '…' : ''}"` : '');
  }
  function parseColor(c) {
    const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null;
    const v = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: v[0], g: v[1], b: v[2], a: v[3] == null ? 1 : v[3] };
  }
  function lum({ r, g, b }) {
    const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  }
  function bgOf(el) {
    for (let n = el; n; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && n !== el) return null; // gradient/image: can't judge
      const c = parseColor(cs.backgroundColor);
      if (c && c.a > 0.9) return c;
      if (n === stage) break;
    }
    return parseColor(getComputedStyle(stage).backgroundColor);
  }

  // text-bearing elements: those with a direct non-empty text node, plus svg <text>
  const active = [...stage.querySelectorAll('.vm-scene')].filter((s) => getComputedStyle(s).visibility !== 'hidden');
  let anyVisible = false;
  for (const scene of active) {
    const walker = document.createTreeWalker(scene, NodeFilter.SHOW_ELEMENT);
    for (let el = walker.currentNode; el; el = walker.nextNode()) {
      if (el === scene) continue;
      const tag = el.tagName.toLowerCase();
      if (['canvas', 'img', 'svg', 'video'].includes(tag)) {
        const r = el.getBoundingClientRect();
        if (r.width > 4 && r.height > 4 && effOpacity(el) > 0.05) anyVisible = true;
      }
      const direct = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
      if (!direct) continue;
      if (el.closest('.katex-mathml')) continue;
      const op = effOpacity(el);
      if (op < 0.05) continue;
      const r0 = el.getBoundingClientRect();
      if (r0.width < 1 || r0.height < 1) continue;
      anyVisible = true;
      const r = { x: (r0.left - sr.left) * k, y: (r0.top - sr.top) * k, w: r0.width * k, h: r0.height * k };
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').trim();
      if (op > 0.5) texts.push(txt);
      const s = sel(el);
      const tol = 2;
      if (op > 0.5 && (r.x < -tol || r.y < -tol || r.x + r.w > W + tol || r.y + r.h > H + tol)) {
        issues.push({ code: 'OFFSTAGE', sel: s, detail: `text box ${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)} leaves the ${W}×${H} frame` });
      } else if (op > 0.5 && !el.closest('[data-allow-unsafe]') && (r.x < sx - tol || r.y < sy - tol || r.x + r.w > W - sx + tol || r.y + r.h > H - sy + tol)) {
        issues.push({ code: 'UNSAFE', sel: s, detail: 'text outside the safe area' });
      }
      // clipped by an overflow:hidden ancestor (excluding SplitText masks mid-animation)
      for (let n = el.parentElement; n && n !== scene; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if ((cs.overflow === 'hidden' || cs.overflow === 'clip') && !n.classList.contains('vm-line-mask') && !/mask/.test(n.className || '')) {
          const pr = n.getBoundingClientRect();
          if (r0.right > pr.right + 2 || r0.bottom > pr.bottom + 2 || r0.left < pr.left - 2 || r0.top < pr.top - 2) {
            issues.push({ code: 'CLIPPED', sel: s, detail: 'text cut off by an overflow:hidden container' });
          }
          break;
        }
      }
      if (el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible' && el.clientWidth > 0) {
        issues.push({ code: 'CLIPPED', sel: s, detail: 'text overflows its own box' });
      }
      const fs = parseFloat(getComputedStyle(el).fontSize) * (el.offsetHeight ? r0.height * k / el.offsetHeight : 1);
      if (fs && fs < minPx && op > 0.5) issues.push({ code: 'TINY_TEXT', sel: s, detail: `${fs.toFixed(0)}px < ${minPx.toFixed(0)}px minimum` });
      const fg = parseColor(getComputedStyle(el).color || getComputedStyle(el).fill);
      const bg = bgOf(el);
      if (fg && bg && op > 0.5 && tag !== 'text' && tag !== 'tspan') {
        const L1 = lum(fg), L2 = lum(bg);
        const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
        if (ratio < 3) issues.push({ code: 'CONTRAST', sel: s, detail: `contrast ${ratio.toFixed(2)}:1 < 3:1` });
      }
      if (op > 0.5) boxes.push({ el, r, s });
    }
  }
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i], b = boxes[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.el.closest('.katex') && a.el.closest('.katex') === b.el.closest('.katex')) continue;
    if (a.el.parentElement === b.el.parentElement && /vm-(word|char)/.test(a.el.className + b.el.className)) continue;
    const ix = Math.max(0, Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x));
    const iy = Math.max(0, Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y));
    const inter = ix * iy, small = Math.min(a.r.w * a.r.h, b.r.w * b.r.h);
    if (small > 0 && inter / small > 0.25) issues.push({ code: 'OVERLAP', sel: a.s, detail: `overlaps ${b.s}` });
  }
  return { issues, texts, blank: !anyVisible };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const res = await check(dir, { samples: args.samples, determinism: !args['no-determinism'], chrome: args.chrome });
  await writeJSON(path.join(projectPaths(dir).qa, 'check.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 3 · runtime check', res.findings);
  process.exit(n.error ? 1 : 0);
}
