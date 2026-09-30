#!/usr/bin/env node
// Render a video-maker project to MP4/WebM/PNG frames.
//
//   node render.mjs <project> [--quality draft|standard|high] [--fps 30] [--4k | --height 2160]
//                             [--workers 4] [--from 0 --to 10 | --scene id] [--format mp4|webm|png]
//                             [--codec h264|h265] [--audio voice.wav] [--out out/video.mp4] [--chrome path]
//                             [--engine vm|hf]   (hf: HyperFrames renderer; also --format mov|gif, --docker, --gpu)
//                             [--4k]             (2× the canvas, e.g. 3840×2160; default is the canvas size)
//                             [--deliver ~/Videos/CustomSkill/<slug>]  (copy mp4 + captions + poster there)
//                             [--no-audio]       (ignore audio/mix.wav)
//
// Every frame i is produced by window.__vm.seek(i / fps) followed by a screenshot, so
// output is deterministic and workers can render disjoint frame ranges in parallel.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs, projectDir, readJSON, serve, launchBrowser, openComposition, which, run, fmtTime } from './lib/common.mjs';
import { projectPaths } from './lib/paths.mjs';
import { writeReadme } from './lib/readme.mjs';

const QUALITY = {
  draft:    { img: 'jpeg', q: 80,  crf: 28, preset: 'veryfast' },
  standard: { img: 'jpeg', q: 92,  crf: 20, preset: 'medium' },
  high:     { img: 'png',  q: null, crf: 16, preset: 'slow' }
};

async function main() {
  const args = parseArgs();
  const dir = projectDir(args);
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const canvas = Object.assign({ width: 1920, height: 1080, fps: 30 }, sb.canvas);
  const q = QUALITY[args.quality || 'standard'];
  if (!q) throw new Error('--quality must be draft, standard or high');
  const fps = +(args.fps || canvas.fps);
  // Output is the composition size (1080p for the default canvas) or exactly 2× (4K). Drafts
  // lower encode quality, never resolution.
  const scale = args['4k'] ? 2 : args.scale ? +args.scale : args.height ? +args.height / canvas.height : 1;
  if (scale !== 1 && scale !== 2) throw new Error(`output must be native (${canvas.width}×${canvas.height}) or 4K (--4k / --height ${canvas.height * 2}); got scale ${scale}`);
  const format = args.format || 'mp4';
  const codec = args.codec || 'h264';
  // The mastered mix from voiceover.mjs is used automatically (vm engine muxes it; the hf engine
  // plays it from the page's <audio id="vm-mix">). --audio overrides, --no-audio renders silent.
  const P = projectPaths(dir, sb);
  const mixFile = P.mix;
  if (args['no-audio']) delete args.audio;
  else if (!args.audio && (args.engine || 'vm') === 'vm' && fs.existsSync(mixFile)) args.audio = mixFile;
  if ((args.engine || 'vm') === 'hf') return renderWithHyperFrames({ args, dir, sb, canvas, fps, scale, format });
  if (args.engine && args.engine !== 'vm') throw new Error('--engine must be vm or hf');
  if (!(await which('ffmpeg')) && format !== 'png') throw new Error('ffmpeg not found on PATH');

  const server = await serve(dir);
  const browser = await launchBrowser(args);
  try {
    // Probe once to learn duration and scene ranges.
    const probe = await openComposition(browser, server.url, { width: canvas.width, height: canvas.height, scale: 1 });
    const info = probe.info;
    await probe.context.close();
    if (!info.ready) throw new Error('composition failed to start:\n  ' + info.errors.join('\n  '));
    if (info.errors.length && !args.force) {
      throw new Error('composition reported errors (use --force to render anyway):\n  ' + info.errors.join('\n  '));
    }

    let t0 = 0, t1 = info.duration;
    if (args.scene) {
      const s = info.scenes.find((x) => x.id === args.scene);
      if (!s) throw new Error(`no scene "${args.scene}"; have: ${info.scenes.map((x) => x.id).join(', ')}`);
      t0 = s.start; t1 = s.end;
    }
    if (args.from != null) t0 = +args.from;
    if (args.to != null) t1 = Math.min(+args.to, info.duration);
    const f0 = Math.round(t0 * fps);
    const f1 = Math.max(f0 + 1, Math.round(t1 * fps));   // exclusive
    const total = f1 - f0;

    const outW = Math.round(canvas.width * scale / 2) * 2;
    const outH = Math.round(canvas.height * scale / 2) * 2;
    const slug = (sb.meta?.slug || sb.meta?.title || path.basename(dir)).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
    const suffix = args.scene ? `-${args.scene}` : (args.from != null || args.to != null) ? `-${t0.toFixed(1)}-${t1.toFixed(1)}` : '';
    const ext = format === 'png' ? '' : '.' + format;
    const out = path.resolve(args.out || path.join(suffix || args.quality === 'draft' ? P.previews : P.exports, `${slug}${suffix}-${outW}x${outH}-${fps}fps${args.quality === 'draft' ? '-draft' : ''}${ext}`));
    await fsp.mkdir(path.dirname(out), { recursive: true });

    const workers = Math.max(1, Math.min(+(args.workers || Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)))), Math.ceil(total / 15)));
    console.log(`▶ ${path.basename(dir)}: ${total} frames (${fmtTime(t0)}–${fmtTime(t1)}) at ${fps} fps → ${outW}×${outH}, ${args.quality || 'standard'}, ${workers} worker(s)`);

    const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'vm-render-'));
    const chunk = Math.ceil(total / workers);
    const started = Date.now();
    let done = 0;
    const tick = () => {
      done++;
      const tty = process.stdout.isTTY;
      const step = tty ? 10 : Math.max(10, Math.round(total / 10));   // non-TTY (agents, CI): ~10 lines total
      if (done % step === 0 || done === total) {
        const el = (Date.now() - started) / 1000;
        const rate = done / el;
        const msg = `  ${done}/${total} frames  ${rate.toFixed(1)} fps  eta ${Math.max(0, (total - done) / rate).toFixed(0)}s`;
        if (tty) process.stdout.write(`\r${msg}   `); else console.log(msg);
      }
    };

    const segs = [];
    const jobs = [];
    for (let w = 0; w < workers; w++) {
      const a = f0 + w * chunk, b = Math.min(f1, a + chunk);
      if (a >= b) continue;
      const seg = format === 'png' ? out : path.join(tmp, `seg-${String(w).padStart(3, '0')}.${format === 'webm' ? 'webm' : 'mp4'}`);
      segs.push(seg);
      jobs.push(renderRange({ browser, server, canvas, scale, fps, a, b, q, seg, format, codec, tick, outW, outH }));
    }
    await Promise.all(jobs);
    if (process.stdout.isTTY) process.stdout.write('\n');

    if (format !== 'png') {
      const list = path.join(tmp, 'list.txt');
      await fsp.writeFile(list, segs.map((s) => `file '${s.replace(/'/g, "'\\''")}'`).join('\n'));
      const joined = args.audio ? path.join(tmp, 'joined.' + format) : out;
      await run('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy',
        ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), joined]);
      if (args.audio) {
        const dur = (f1 - f0) / fps;
        await run('ffmpeg', ['-y', '-v', 'error', '-i', joined, '-ss', String(args['audio-offset'] || t0), '-i', path.resolve(args.audio),
          '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k',
          '-t', String(dur), ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), out]);
      }
    }
    await fsp.rm(tmp, { recursive: true, force: true });
    const secs = (Date.now() - started) / 1000;
    console.log(`✔ wrote ${out}  (${secs.toFixed(1)}s, ${(total / secs).toFixed(1)} frames/s)`);
    if (format !== 'png') {
      const size = (await fsp.stat(out)).size;
      console.log(`  ${(size / 1e6).toFixed(2)} MB — verify with: node ${path.relative(process.cwd(), path.join(path.dirname(fileURLToPath(import.meta.url)), 'verify-output.mjs'))} ${path.relative(process.cwd(), dir) || '.'} ${path.relative(process.cwd(), out)}${suffix ? ' --partial' : ''}${scale !== 1 ? ' --expect-height ' + outH : ''}`);
    }
    return out;
  } finally {
    await browser.close();
    await server.close();
  }
}

async function renderRange({ browser, server, canvas, scale, fps, a, b, q, seg, format, codec, tick, outW, outH }) {
  const { context, page, info } = await openComposition(browser, server.url, { width: canvas.width, height: canvas.height, scale });
  if (!info.ready) throw new Error('composition failed in worker: ' + info.errors.join('; '));
  let ff = null, ffDone = null;
  if (format === 'png') {
    await fsp.mkdir(seg, { recursive: true });
  } else {
    const vcodec = format === 'webm'
      ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(q.crf + 12), '-row-mt', '1', '-deadline', q.preset === 'veryfast' ? 'realtime' : 'good']
      : codec === 'h265'
        ? ['-c:v', 'libx265', '-crf', String(q.crf + 2), '-preset', q.preset, '-tag:v', 'hvc1']
        : ['-c:v', 'libx264', '-crf', String(q.crf), '-preset', q.preset, '-profile:v', 'high'];
    const argv = ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', q.img === 'png' ? 'png' : 'mjpeg', '-i', '-',
      '-vf', `scale=${outW}:${outH}:flags=lanczos:out_range=tv,format=yuv420p`, '-pix_fmt', 'yuv420p', '-color_range', 'tv', ...vcodec, '-r', String(fps), '-g', String(fps * 2), seg];
    ff = spawn('ffmpeg', argv, { stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    ff.stderr.on('data', (d) => (err += d));
    ffDone = new Promise((res, rej) => ff.on('close', (c) => c === 0 ? res() : rej(new Error('ffmpeg failed: ' + err.slice(-1500)))));
  }
  const clip = { x: 0, y: 0, width: canvas.width, height: canvas.height };
  for (let f = a; f < b; f++) {
    await page.evaluate((t) => window.__vm.seek(t), f / fps);
    const buf = await page.screenshot({ type: q.img, quality: q.q ?? undefined, clip, scale: 'device', animations: 'disabled', caret: 'hide' });
    if (format === 'png') {
      await fsp.writeFile(path.join(seg, `frame-${String(f).padStart(6, '0')}.png`), buf);
    } else if (!ff.stdin.write(buf)) {
      await new Promise((r) => ff.stdin.once('drain', r));
    }
    tick();
  }
  if (ff) { ff.stdin.end(); await ffDone; }
  const errs = await page.evaluate(() => window.__vm.errors.slice());
  await context.close();
  if (errs.length) console.warn(`\n  ⚠ runtime errors during render (${a}-${b}): ${errs.join('; ')}`);
}

// --engine hf: the same project through HyperFrames' renderer (Puppeteer + beginFrame capture;
// adds mov/gif/png-sequence, Docker and GPU encode). Audio declared in the page is mixed by
// HyperFrames; an explicit --audio file is muxed afterwards exactly like the vm engine does.
async function renderWithHyperFrames({ args, dir, sb, canvas, fps, scale, format }) {
  if (args.scene || args.from != null || args.to != null) throw new Error('--engine hf renders whole compositions; use --engine vm for --scene/--from/--to');
  const HFQ = { draft: 'draft', standard: 'looks', high: 'delivery' };
  const quality = HFQ[args.quality || 'standard'];
  const outH = Math.round(canvas.height * scale / 2) * 2, outW = Math.round(canvas.width * scale / 2) * 2;
  const slug = (sb.meta?.slug || path.basename(dir)).toString().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'video';
  const ext = { mp4: '.mp4', webm: '.webm', mov: '.mov', gif: '.gif', png: '' }[format];
  if (ext == null) throw new Error('--format for --engine hf: mp4, webm, mov, gif or png');
  const out = path.resolve(args.out || path.join(args.quality === 'draft' ? projectPaths(dir, sb).previews : projectPaths(dir, sb).exports, `${slug}-${outW}x${outH}-${fps}fps-hf${args.quality === 'draft' ? '-draft' : ''}${ext}`));
  await fsp.mkdir(path.dirname(out), { recursive: true });
  // HyperFrames renders at the composition size or 4K (landscape-4k / portrait-4k / square-4k).
  const hf4k = scale === 2;
  const orient = canvas.width > canvas.height ? 'landscape' : canvas.width < canvas.height ? 'portrait' : 'square';
  const tmp = args.audio ? await fsp.mkdtemp(path.join(os.tmpdir(), 'vm-hf-')) : null;
  const target = tmp && format !== 'png' ? path.join(tmp, 'video' + ext) : out;
  const argv = ['render', '-o', target, '--quality', quality, '--fps', String(fps),
    '--format', format === 'png' ? 'png-sequence' : format];
  if (hf4k) argv.push('--resolution', `${orient}-4k`);
  if (args.workers) argv.push('--workers', String(args.workers));
  if (args.docker) argv.push('--docker');
  if (args.gpu) argv.push('--gpu');
  if (args.strict) argv.push('--strict');
  const { runHF } = await import('./lib/hf.mjs');
  console.log(`▶ ${path.basename(dir)} via HyperFrames: hyperframes ${argv.join(' ')}`);
  const { code } = await runHF(dir, argv, { telemetry: !!args.telemetry });
  if (code !== 0) throw new Error(`hyperframes render exited with ${code}`);
  if (target !== out) {
    await run('ffmpeg', ['-y', '-v', 'error', '-i', target, '-i', path.resolve(args.audio), '-map', '0:v', '-map', '1:a',
      '-c:v', 'copy', '-c:a', format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k', '-shortest',
      ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), out]);
    await fsp.rm(tmp, { recursive: true, force: true });
  }
  console.log(`✔ wrote ${out}`);
  return out;
}

// --deliver <dir>: copy the finished file plus its sidecars (captions, poster) somewhere the user
// can find them. Poster = the frame at storyboard meta.poster_t (default: 40 % in).
async function deliver(out, dir, sb, dest) {
  const target = path.resolve(dest);
  await fsp.mkdir(target, { recursive: true });
  const base = path.basename(out).replace(/\.[^.]+$/, '');
  const copies = [[out, path.join(target, path.basename(out))]];
  for (const ext of ['srt', 'vtt']) {
    const f = projectPaths(dir, sb).captions[ext];
    if (fs.existsSync(f)) copies.push([f, path.join(target, `${base}.${ext}`)]);
  }
  for (const [a, b] of copies) if (path.resolve(a) !== b) await fsp.copyFile(a, b);
  const total = +(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out])).out.trim();
  const t = sb.meta?.poster_t ?? total * 0.4;
  await run('ffmpeg', ['-y', '-v', 'error', '-ss', String(t), '-i', out, '-frames:v', '1', path.join(target, `${base}-poster.png`)]);
  console.log(`✔ delivered to ${target}: ${copies.length} file(s) + poster`);
}

main().then(async (out) => {
  const args = parseArgs();
  if (!out) return;
  const dir = projectDir(args);
  writeReadme(dir);
  if (!args.deliver || args.format === 'png') return;
  await deliver(out, dir, await readJSON(path.join(dir, 'storyboard.json')), args.deliver);
}).catch((e) => { console.error('\n✖ render failed:', e.message); process.exit(1); });
