#!/usr/bin/env node
// Gate 4 — visual review material. Captures stills and builds labelled contact sheets that the
// agent (and the user) LOOK AT before rendering. Pixels, not code, are the final judge.
//
//   node snapshot.mjs <project>                       3 stills per scene + beats → .build/qa/contact-sheet-*.png
//   node snapshot.mjs <project> --scene hook          only that scene, 6 stills
//   node snapshot.mjs <project> --times 1.5,4,12.25   exact times (seconds)
//   node snapshot.mjs <project> --every 2             one still every 2 s
//   options: --per-scene N  --cols 4  --thumb 640  --out qa
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, projectDir, readJSON, serve, launchBrowser, openComposition, isMain, fmtTime } from './lib/common.mjs';
import { projectPaths } from './lib/paths.mjs';

export async function snapshot(dir, opts = {}) {
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const canvas = Object.assign({ width: 1920, height: 1080 }, sb.canvas);
  const outDir = opts.out ? path.resolve(dir, opts.out) : projectPaths(dir, sb).qa;
  const framesDir = path.join(outDir, 'frames');
  await fsp.rm(framesDir, { recursive: true, force: true });
  await fsp.mkdir(framesDir, { recursive: true });
  const server = await serve(dir);
  const browser = await launchBrowser(opts);
  const shots = [];
  try {
    const { context, page, info } = await openComposition(browser, server.url, { width: canvas.width, height: canvas.height });
    if (!info.ready) throw new Error('composition failed: ' + info.errors.join('; '));
    const want = [];
    const sceneAt = (t) => info.scenes.filter((s) => t >= s.start && t <= s.end).pop();
    if (opts.times) {
      String(opts.times).split(',').map(Number).forEach((t) => want.push({ t, scene: sceneAt(t)?.id, why: 'requested' }));
    } else if (opts.every) {
      for (let t = 0; t <= info.duration; t += +opts.every) want.push({ t: +t.toFixed(3), scene: sceneAt(t)?.id, why: 'every' });
    } else {
      const scenes = opts.scene ? info.scenes.filter((s) => s.id === opts.scene) : info.scenes;
      if (!scenes.length) throw new Error('no scene ' + opts.scene);
      const n = +(opts['per-scene'] || (opts.scene ? 6 : 3));
      for (const s of scenes) {
        const spec = sb.scenes.find((x) => x.id === s.id) || {};
        const ts = [];
        for (let k = 0; k < n; k++) ts.push({ t: s.start + s.duration * (n === 1 ? 0.6 : 0.12 + 0.8 * k / (n - 1)), why: `${Math.round((0.12 + 0.8 * k / Math.max(1, n - 1)) * 100)}%` });
        if (!opts.scene) for (const b of spec.beats || []) if (b.id) ts.push({ t: s.start + Math.min(s.duration - 0.05, b.t + 0.8), why: `beat:${b.id}` });
        ts.sort((a, b) => a.t - b.t).forEach((x) => want.push({ ...x, t: +x.t.toFixed(3), scene: s.id }));
      }
    }
    for (const w of want) {
      await page.evaluate((t) => window.__vm.seek(t), w.t);
      const file = path.join(framesDir, `${String(shots.length).padStart(3, '0')}-${w.scene || 'x'}-${w.t.toFixed(2)}s.jpg`);
      await page.screenshot({ path: file, type: 'jpeg', quality: 88, clip: { x: 0, y: 0, width: canvas.width, height: canvas.height }, animations: 'disabled', caret: 'hide' });
      shots.push({ ...w, file });
    }
    await context.close();

    // Contact sheets: one row group per scene, labelled with scene id, time and why.
    const thumbW = +(opts.thumb || 560);
    const thumbH = Math.round(thumbW * canvas.height / canvas.width);
    const cols = +(opts.cols || (canvas.height > canvas.width ? 6 : 4));
    const perSheet = cols * Math.max(2, Math.floor(3600 / (thumbH + 40)));
    const sheets = [];
    for (let i = 0; i < shots.length; i += perSheet) {
      const group = shots.slice(i, i + perSheet);
      const cells = await Promise.all(group.map(async (s) => {
        const b64 = (await fsp.readFile(s.file)).toString('base64');
        return `<figure><img src="data:image/jpeg;base64,${b64}"><figcaption><b>${s.scene || ''}</b> ${fmtTime(s.t)} <i>${s.why}</i></figcaption></figure>`;
      }));
      const html = `<!doctype html><meta charset=utf-8><style>
        body{margin:0;background:#0d0f14;color:#cfd6e3;font:13px/1.3 ui-monospace,monospace;padding:14px}
        h1{font-size:14px;margin:0 0 12px;color:#fff} .g{display:grid;grid-template-columns:repeat(${cols},${thumbW}px);gap:12px}
        figure{margin:0} img{width:${thumbW}px;height:${thumbH}px;display:block;border:1px solid #2a3140;object-fit:contain;background:#000}
        figcaption{padding:4px 2px} b{color:#7fc1ff} i{color:#7d8799;font-style:normal;float:right}</style>
        <h1>${(sb.meta?.title || path.basename(dir)).replace(/</g, '&lt;')} — ${canvas.width}×${canvas.height} · ${fmtTime(info.duration)} · sheet ${sheets.length + 1}</h1><div class=g>${cells.join('')}</div>`;
      const p = await browser.newPage({ viewport: { width: cols * (thumbW + 12) + 16, height: 400 } });
      await p.setContent(html, { waitUntil: 'load' });
      const out = path.join(outDir, `contact-sheet-${sheets.length + 1}.png`);
      await p.screenshot({ path: out, fullPage: true });
      await p.close();
      sheets.push(out);
    }
    return { shots, sheets };
  } finally {
    await browser.close();
    await server.close();
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const res = await snapshot(dir, args);
  console.log(`\nGate 4 · snapshots: ${res.shots.length} stills in ${path.relative(process.cwd(), path.join(args.out ? path.resolve(dir, args.out) : projectPaths(dir).qa, 'frames'))}`);
  res.sheets.forEach((s) => console.log('  contact sheet → ' + path.relative(process.cwd(), s)));
  console.log('  Now LOOK at every sheet and score it against references/validation.md (visual rubric).');
}
