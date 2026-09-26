#!/usr/bin/env node
// Generate a project's illustrations with the bundled imagegen dispatcher, then make them
// video-ready and lay them out for review.
//
//   node images.mjs <project> [--only a,b] [--force] [--jobs N] [--sheet-only] [--list]
//
// Reads storyboard.images:
//   { "backend": "codex" | "comfy", "model": "z-image-turbo", "size": "landscape",
//     "style": "<style key appended to every prompt>",
//     "items": [ { "name": "hero", "prompt": "…", "backend"?, "model"?, "size"?, "seed"? } ] }
//
// For each item it writes assets/img/specs/<name>.json (an imagegen job spec) and runs
// imagegen/scripts/imagegen.sh on it (codex jobs 3 at a time, comfy jobs 1 at a time: one GPU).
// imagegen's manifest.json is the only completion signal. A finished image is converted to
// assets/img/<name>.jpg, large enough to cover the canvas (Lanczos, q≈90). Items whose prompt,
// style, backend, model, size and seed are unchanged since the last run are skipped
// (assets/img/images.lock.json), so editing one prompt regenerates one image.
// It finishes by writing qa/images-contact-sheet.png: every image with the canvas-aspect crop
// drawn on it. LOOK at that sheet before using the images.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { parseArgs, projectDir, readJSON, writeJSON, SKILL_DIR, launchBrowser, which } from './lib/common.mjs';

const args = parseArgs();
const dir = projectDir(args);
const sb = await readJSON(path.join(dir, 'storyboard.json'));
const cfg = sb.images || {};
const items = (cfg.items || []).filter((it) => !args.only || String(args.only).split(',').includes(it.name));
const canvas = Object.assign({ width: 1920, height: 1080 }, sb.canvas);
const imgDir = path.join(dir, 'assets', 'img');
const specDir = path.join(imgDir, 'specs');
const lockPath = path.join(imgDir, 'images.lock.json');
const DISPATCH = path.join(SKILL_DIR, 'imagegen', 'scripts', 'imagegen.sh');
const JOBS_ROOT = path.join(process.env.IMAGEGEN_ROOT || path.join(process.env.HOME || '', 'imagegen'), 'jobs');

if (!cfg.items || !cfg.items.length) { console.log('storyboard.images.items is empty: nothing to generate (see references/images.md).'); process.exit(0); }
await fsp.mkdir(specDir, { recursive: true });
const lock = fs.existsSync(lockPath) ? await readJSON(lockPath) : {};

const resolved = items.map((it) => {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(it.name || '')) throw new Error(`image name "${it.name}" must be a lowercase slug`);
  const backend = it.backend || cfg.backend || 'codex';
  const model = backend === 'comfy' ? (it.model || cfg.model || 'z-image-turbo') : null;
  const size = it.size || cfg.size || (canvas.width >= canvas.height ? 'landscape' : 'portrait');
  const prompt = [it.prompt, it.style === false ? '' : (cfg.style || '')].filter(Boolean).join(' ');
  const seed = it.seed ?? null;
  const hash = crypto.createHash('sha1').update(JSON.stringify([backend, model, size, prompt, seed])).digest('hex').slice(0, 8);
  const slug = (sb.meta?.slug || path.basename(dir)).replace(/[^a-z0-9-]/gi, '-').toLowerCase();
  const job_id = `${slug}-${it.name}-${hash}`;
  const out = path.join(imgDir, `${it.name}.jpg`);
  return { name: it.name, backend, model, size, prompt, seed, hash, job_id, out };
});

if (args.list) {
  for (const r of resolved) console.log(`${r.name.padEnd(16)} ${r.backend}${r.model ? '/' + r.model : ''}  ${r.size}  ${lock[r.name]?.hash === r.hash && fs.existsSync(r.out) ? 'up to date' : 'to generate'}`);
  process.exit(0);
}

function ffmpegOk() { return spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0; }
if (!args['sheet-only']) {
  if (!fs.existsSync(DISPATCH)) { console.error(`imagegen dispatcher missing: ${DISPATCH}`); process.exit(2); }
  if (!(await which('jq'))) { console.error('jq is required by imagegen (dnf/apt/brew install jq)'); process.exit(2); }
  if (!ffmpegOk()) { console.error('ffmpeg is required'); process.exit(2); }
}

// Make a finished image cover the canvas: scale so both sides are ≥ the canvas, keep aspect.
function toJpeg(src, w, h, out) {
  const k = Math.max(canvas.width / w, canvas.height / h, 1);
  const W = Math.round((w * k) / 2) * 2, H = Math.round((h * k) / 2) * 2;
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-vf', `scale=${W}:${H}:flags=lanczos`, '-q:v', '3', out], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed on ${src}: ${r.stderr}`);
  return { W, H };
}

function runJob(r) {
  return new Promise((resolve) => {
    const spec = { job_id: r.job_id, backend: r.backend, prompt: r.prompt, size: r.size, filename: r.name, count: 1, seed: r.seed };
    if (r.model) spec.model = r.model;
    const specPath = path.join(specDir, `${r.name}.json`);
    fs.writeFileSync(specPath, JSON.stringify(spec, null, 2) + '\n');
    const manifest = path.join(JOBS_ROOT, r.job_id, 'manifest.json');
    const done = () => {
      let m = null;
      try { m = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { /* no manifest = crashed before writing one */ }
      resolve({ r, m });
    };
    // A job with this exact spec already finished (e.g. a crash after generation): reuse it.
    try { const m = JSON.parse(fs.readFileSync(manifest, 'utf8')); if (m.status === 'ok') return done(); } catch { /* run it */ }
    const t0 = Date.now();
    console.log(`▶ ${r.name}: ${r.backend}${r.model ? '/' + r.model : ''} (${r.size}) …`);
    const p = spawn('bash', [DISPATCH, specPath, '--force'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', () => { if (err.trim()) console.log(`  ${r.name}: ${err.trim().split('\n').pop()}`); console.log(`  ${r.name} finished in ${((Date.now() - t0) / 1000).toFixed(0)} s`); done(); });
  });
}

async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]); } }));
  return out;
}

let failed = 0;
if (!args['sheet-only']) {
  const todo = resolved.filter((r) => args.force || lock[r.name]?.hash !== r.hash || !fs.existsSync(r.out));
  const fresh = resolved.length - todo.length;
  if (fresh) console.log(`✔ ${fresh} image(s) up to date (unchanged prompt): ${resolved.filter((r) => !todo.includes(r)).map((r) => r.name).join(', ')}`);
  const byBackend = { codex: todo.filter((r) => r.backend === 'codex'), other: todo.filter((r) => r.backend !== 'codex') };
  const results = (await Promise.all([
    pool(byBackend.codex, +(args.jobs || 3), runJob),
    pool(byBackend.other, 1, runJob)          // comfy: one GPU, one job at a time
  ])).flat();
  for (const { r, m } of results) {
    const img = m?.images?.[0];
    if (!m || m.status === 'error' || !img || !fs.existsSync(img.abs_path)) {
      failed++;
      console.log(`✖ ${r.name}: ${m ? m.status + ' · ' + (m.errors || []).join('; ') : 'no manifest'}${m?.log_tail ? '\n    ' + m.log_tail.split('\n').slice(-3).join('\n    ') : ''}`);
      continue;
    }
    const { W, H } = toJpeg(img.abs_path, img.w || canvas.width, img.h || canvas.height, r.out);
    lock[r.name] = { hash: r.hash, job_id: r.job_id, backend: r.backend, model: r.model, size: r.size, seed: m.params?.seed ?? img.seed ?? null,
      source: img.abs_path, source_size: [img.w, img.h], output: `assets/img/${r.name}.jpg`, output_size: [W, H], status: m.status };
    console.log(`✔ ${r.name} → assets/img/${r.name}.jpg (${W}×${H})${m.status === 'partial' ? '  ▲ partial: ' + (m.errors || []).join('; ') : ''}`);
  }
  await writeJSON(lockPath, lock);
}

// Review sheet: each image with the cover-crop the canvas will actually show.
const shown = resolved.filter((r) => fs.existsSync(r.out));
if (shown.length) {
  const aspect = canvas.width / canvas.height;
  const tiles = shown.map((r) => {
    const [w, h] = lock[r.name]?.output_size || [canvas.width, canvas.height];
    const ia = w / h;
    // visible fraction of the image under object-fit: cover at the canvas aspect
    const fw = ia > aspect ? aspect / ia : 1, fh = ia > aspect ? 1 : ia / aspect;
    const src = 'data:image/jpeg;base64,' + fs.readFileSync(r.out).toString('base64');
    return `<figure><div class="im" style="aspect-ratio:${ia}"><img src="${src}"><i style="left:${(1 - fw) * 50}%;top:${(1 - fh) * 50}%;width:${fw * 100}%;height:${fh * 100}%"></i></div>
      <figcaption><b>${r.name}</b> · ${r.backend}${r.model ? '/' + r.model : ''} · seed ${lock[r.name]?.seed ?? '—'}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#111;color:#ddd;font:15px system-ui;padding:16px}
    h1{font-size:16px;margin:0 0 12px}main{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}figure{margin:0}
    .im{position:relative;width:100%;overflow:hidden;background:#000}.im img{width:100%;height:100%;object-fit:fill;display:block}
    .im i{position:absolute;border:2px solid #ff4d4d;box-shadow:0 0 0 9999px rgba(0,0,0,.35)}figcaption{margin-top:6px}</style>
    <h1>${(sb.meta?.title || path.basename(dir)).replace(/</g, '&lt;')} · illustrations · red frame = what a ${canvas.width}×${canvas.height} canvas shows with object-fit: cover</h1><main>${tiles}</main>`;
  const browser = await launchBrowser(args);
  const page = await browser.newPage({ viewport: { width: 1800, height: 200 } });
  await page.setContent(html, { waitUntil: 'load' });
  await fsp.mkdir(path.join(dir, 'qa'), { recursive: true });
  const sheet = path.join(dir, 'qa', 'images-contact-sheet.png');
  await page.screenshot({ path: sheet, fullPage: true });
  await browser.close();
  console.log(`\n✔ review sheet → ${path.relative(process.cwd(), sheet)}\n  Now LOOK at it: right subject, nothing important outside the red frame, no stray text or artefacts.`);
}
const missing = resolved.filter((r) => !fs.existsSync(r.out)).map((r) => r.name);
if (missing.length) console.log(`▲ not yet generated: ${missing.join(', ')}`);
process.exit(failed ? 1 : 0);
