#!/usr/bin/env node
// Gate 5 — verify a rendered file: container facts match the storyboard, and no accidental
// black stretches or long frozen stretches.
//
//   node verify-output.mjs <project> <video> [--expect-height 2160] [--freeze 4] [--partial] [--json]
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, run, isMain, fmtTime } from './lib/common.mjs';

export async function verifyOutput(dir, video, opts = {}) {
  const F = [];
  const add = (level, code, msg, extra = {}) => F.push({ level, code, msg, ...extra });
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const canvas = Object.assign({ width: 1920, height: 1080, fps: 30 }, sb.canvas);
  const { out } = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-count_packets', '-of', 'json', video]);
  const probe = JSON.parse(out);
  const v = probe.streams.find((s) => s.codec_type === 'video');
  const a = probe.streams.find((s) => s.codec_type === 'audio');
  if (!v) { add('error', 'NO_VIDEO', 'no video stream'); return { findings: F }; }
  const [n, d] = v.r_frame_rate.split('/').map(Number);
  const fps = n / d;
  const dur = +probe.format.duration;
  const frames = +v.nb_read_packets || Math.round(dur * fps);

  // Expected timeline length from the storyboard (with transition overlaps).
  let total = 0;
  (sb.scenes || []).forEach((s, i) => {
    const tr = i ? Math.min(+(s.transition_in?.duration || 0), +s.duration, +sb.scenes[i - 1].duration) : 0;
    total = Math.max(0, total - tr) + +s.duration;
  });
  const partial = !!opts.partial;   // a --scene / --from/--to render: skip the whole-timeline frame count
  const expFps = +(opts.fps || canvas.fps);
  const expFrames = Math.round(total * expFps);
  if (Math.abs(fps - expFps) > 0.01) add('warn', 'FPS', `${fps.toFixed(3)} fps, storyboard says ${expFps}`);
  if (!partial && Math.abs(frames - expFrames) > 1) add('error', 'FRAMES', `${frames} frames, expected ${expFrames} (${fmtTime(total)} × ${expFps})`);
  const aspect = canvas.width / canvas.height;
  if (Math.abs(v.width / v.height - aspect) > 0.01) add('error', 'ASPECT', `${v.width}×${v.height} does not match canvas aspect ${canvas.width}×${canvas.height}`);
  if (opts['expect-height'] && v.height !== +opts['expect-height']) add('error', 'RESOLUTION', `height ${v.height}, expected ${opts['expect-height']}`);
  if (v.pix_fmt !== 'yuv420p' && v.codec_name === 'h264') add('warn', 'PIXFMT', `pix_fmt ${v.pix_fmt}; yuv420p plays everywhere`);
  if (sb.audio?.voiceover?.enabled && !a) add('error', 'AUDIO', 'voice-over enabled in storyboard but file has no audio stream');
  add('info', 'FILE', `${v.codec_name} ${v.width}×${v.height} ${fps.toFixed(2)}fps ${fmtTime(dur)} ${frames} frames${a ? ' + ' + a.codec_name + ' audio' : ''}, ${(+probe.format.size / 1e6).toFixed(2)} MB`);

  // Black and frozen stretches, mapped back to scenes.
  const sceneAt = (t) => {
    let c = 0, id = null;
    (sb.scenes || []).forEach((s, i) => { const tr = i ? Math.min(+(s.transition_in?.duration || 0), +s.duration) : 0; const st = Math.max(0, c - tr); if (t >= st) id = s.id; c = st + +s.duration; });
    return id;
  };
  const freezeD = +(opts.freeze || 4);
  const { err } = await run('ffmpeg', ['-v', 'info', '-i', video, '-vf', `blackdetect=d=0.4:pix_th=0.02:pic_th=0.998,freezedetect=n=0.0008:d=${freezeD}`, '-an', '-f', 'null', '-']);
  for (const m of err.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)) {
    const s = +m[1], e = +m[2];
    const edge = s < 0.05 || Math.abs(e - dur) < 0.1;
    add(edge ? 'info' : 'warn', 'BLACK', `black ${s.toFixed(2)}–${e.toFixed(2)}s${edge ? ' (at an edge — intended fade?)' : ''}`, { scene: sceneAt(s), t: s });
  }
  const fs = [...err.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => +m[1]);
  const fe = [...err.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => +m[1]);
  fs.forEach((s, i) => {
    const e = fe[i] ?? dur;
    add('warn', 'FROZEN', `no motion for ${(e - s).toFixed(1)}s (${s.toFixed(2)}–${e.toFixed(2)}s) — add drift or shorten the hold`, { scene: sceneAt(s), t: s });
  });
  return { findings: F, probe: { width: v.width, height: v.height, fps, duration: dur, frames, codec: v.codec_name, audio: !!a } };
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const video = path.resolve(args._[1] || '');
  if (!args._[1]) { console.error('usage: verify-output.mjs <project> <video>'); process.exit(2); }
  const res = await verifyOutput(dir, video, args);
  await writeJSON(path.join(dir, 'qa', 'output.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 5 · output', res.findings);
  process.exit(n.error ? 1 : 0);
}
