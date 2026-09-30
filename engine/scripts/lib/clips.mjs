// Render the edit package's clips (render.mjs --edit): every stale scene clip (the scene alone,
// ?solo=<id>), transition clip (the whole video over the overlap, ?layer=scenes) and the overlay
// layer (?layer=overlays, with alpha). Fresh clips are skipped; see lib/segments.mjs for the
// plan and the fingerprints. Each clip is written to a temp file and renamed into place, so an
// editor never sees half a file, and the manifest is updated after every finished clip.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { serve, launchBrowser, openComposition } from './common.mjs';
import { projectPaths } from './paths.mjs';
import { planStatus, writeManifest, editSettings, EDIT_CODECS, ALPHA_CODEC } from './segments.mjs';

const CAPTURE = { draft: { img: 'jpeg', q: 80 }, standard: { img: 'jpeg', q: 92 }, high: { img: 'png', q: null } };

function encoder({ file, fps, outW, outH, img, codec, pad = 0, alpha = false }) {
  const vf = [`scale=${outW}:${outH}:flags=lanczos${alpha ? '' : ':out_range=tv'}`];
  if (pad) vf.push(`tpad=start_mode=clone:start_duration=${pad / fps}:stop_mode=clone:stop_duration=${pad / fps}`);
  const argv = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', img === 'png' ? 'png' : 'mjpeg', '-i', '-',
    '-vf', vf.join(','), ...codec.argv, '-r', String(fps),
    ...(alpha ? [] : ['-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709']),
    '-f', codec.ext === '.mp4' ? 'mp4' : 'mov', file];
  const ff = spawn('ffmpeg', argv, { stdio: ['pipe', 'ignore', 'pipe'] });
  let err = '';
  ff.stderr.on('data', (d) => (err += d));
  const done = new Promise((res, rej) => ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-1500))))));
  return {
    async write(buf) { if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r)); },
    async end() { ff.stdin.end(); await done; }
  };
}

async function renderClip({ browser, server, canvas, scale, fps, item, capture, codec, onFrame }) {
  const mode = item.kind === 'scene' ? { solo: item.id } : item.kind === 'transition' ? { layer: 'scenes' } : { layer: 'overlays' };
  const alpha = item.kind === 'overlay';
  const { context, page, info } = await openComposition(browser, server.url, { width: canvas.width, height: canvas.height, scale, ...mode });
  if (!info.ready) throw new Error(`${item.id}: composition failed: ${info.errors.join('; ')}`);
  const tmp = item.file + '.part' + (alpha ? ALPHA_CODEC.ext : codec.ext);
  await fsp.mkdir(path.dirname(item.file), { recursive: true });
  const outW = Math.round(canvas.width * scale / 2) * 2, outH = Math.round(canvas.height * scale / 2) * 2;
  const img = alpha ? 'png' : capture.img;
  const enc = encoder({ file: tmp, fps, outW, outH, img, codec: alpha ? ALPHA_CODEC : codec, pad: item.kind === 'scene' ? item.render.handles : 0, alpha });
  const clip = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  const first = item.kind === 'scene' ? 0 : item.render.start;
  try {
    for (let k = 0; k < item.render.frames; k++) {
      await page.evaluate((t) => window.__vm.seek(t), (first + k) / fps);
      await enc.write(await page.screenshot({ type: img, quality: img === 'png' ? undefined : capture.q, clip, scale: 'device',
        animations: 'disabled', caret: 'hide', omitBackground: alpha }));
      onFrame();
    }
    await enc.end();
  } catch (e) { await fsp.rm(tmp, { force: true }); throw e; }
  const errs = await page.evaluate(() => window.__vm.errors.slice());
  await context.close();
  if (errs.length) console.warn(`\n  ⚠ runtime errors in ${item.id}: ${errs.join('; ')}`);
  await fsp.rename(tmp, item.file);
}

/**
 * Bring edit/ up to date. Returns { rendered: [...ids], fresh: n, plan }.
 * opts: args from render.mjs (--edit-codec, --handles, --quality, --workers, --only, --force, --4k).
 */
export async function renderEditClips(dir, sb, args = {}) {
  const P = projectPaths(dir, sb);
  if (P.layout < 2) throw new Error('the edit package needs project layout 2 — run: node engine/scripts/migrate-layout.mjs ' + path.relative(process.cwd(), dir));
  const canvas = Object.assign({ width: 1920, height: 1080, fps: 30 }, sb.canvas);
  const fps = +(args.fps || canvas.fps);
  const scale = args['4k'] ? 2 : 1;
  const e = editSettings(sb, args);
  const codec = EDIT_CODECS[e.codec];
  const capture = CAPTURE[args.quality || 'standard'] || CAPTURE.standard;
  const { plan, items, manifest } = planStatus(sb, dir, { fps, handles: e.handles, codec: e.codec, scale });
  const only = args.only ? new Set(String(args.only).split(',')) : null;
  const todo = items.filter((it) => (args.force || it.stale) && (!only || only.has(it.id) || only.has(it.from) || only.has(it.to)));

  // Latest only: drop clips (and manifest rows) that the plan no longer has.
  const keep = new Set(items.map((it) => path.resolve(it.file)));
  for (const d of [P.editVideo, P.editOverlay]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) {
      const p = path.resolve(d, f);
      if (/\.(mov|mp4)$/.test(f) && !keep.has(p)) { await fsp.rm(p, { force: true }); delete manifest.clips[path.relative(dir, p)]; console.log(`  − removed ${path.relative(dir, p)} (no longer in the storyboard)`); }
      if (/\.part\./.test(f)) await fsp.rm(p, { force: true });
    }
  }
  for (const rel of Object.keys(manifest.clips)) if (!keep.has(path.resolve(dir, rel))) delete manifest.clips[rel];

  const fresh = items.length - todo.length;
  if (!todo.length) { writeManifest(dir, sb, manifest); console.log(`▶ edit package: all ${items.length} clip(s) fresh`); return { rendered: [], fresh, plan, items }; }
  const frames = todo.reduce((n, it) => n + it.render.frames, 0);
  const workers = Math.max(1, Math.min(todo.length, +(args.workers || Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2))))));
  console.log(`▶ edit package: rendering ${todo.length} of ${items.length} clip(s), ${frames} frames (${e.codec}, ${e.handles}s handles, ${workers} worker(s))${fresh ? `; ${fresh} fresh` : ''}`);

  const server = await serve(dir);
  const browser = await launchBrowser(args);
  const started = Date.now();
  let done = 0;
  const tty = process.stdout.isTTY;
  const onFrame = () => {
    done++;
    if (tty && done % 10 === 0) process.stdout.write(`\r  ${done}/${frames} frames  ${(done / ((Date.now() - started) / 1000)).toFixed(1)} fps   `);
  };
  const queue = [...todo].sort((a, b) => b.render.frames - a.render.frames);   // longest first
  const rendered = [];
  try {
    await Promise.all(Array.from({ length: workers }, async () => {
      while (queue.length) {
        const it = queue.shift();
        const t0 = Date.now();
        await renderClip({ browser, server, canvas, scale, fps, item: it, capture, codec, onFrame });
        manifest.clips[path.relative(dir, it.file)] = { key: it.key, kind: it.kind, frames: it.media.frames, codec: it.kind === 'overlay' ? 'prores4444' : e.codec, rendered: new Date().toISOString() };
        writeManifest(dir, sb, manifest);
        rendered.push(it.id);
        if (tty) process.stdout.write('\r' + ' '.repeat(60) + '\r');
        console.log(`  ✔ ${path.relative(dir, it.file)}  ${it.media.frames} fr  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
    }));
  } finally {
    await browser.close();
    await server.close();
  }
  const secs = (Date.now() - started) / 1000;
  console.log(`✔ edit package: ${rendered.length} clip(s) in ${secs.toFixed(1)}s (${(frames / secs).toFixed(1)} frames/s)`);
  return { rendered, fresh, plan, items };
}
