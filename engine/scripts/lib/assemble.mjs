// The final export, assembled from the edit package with FFmpeg alone (no browser): the picture
// as a plain sequence of pieces (each scene's uncovered middle, then the transition after it;
// see clipPlan().pieces), the caption layer overlaid once, and the mastered mix muxed in. The
// delivered file is therefore made of exactly the clips an editor imports.
import fsp from 'node:fs/promises';
import path from 'node:path';
import { run } from './common.mjs';

const ENCODE = {
  draft:    { crf: 28, preset: 'veryfast' },
  standard: { crf: 20, preset: 'medium' },
  high:     { crf: 16, preset: 'slow' }
};

export async function assemble({ plan, out, mix, quality = 'standard', codec = 'h264', format = 'mp4' }) {
  const q = ENCODE[quality] || ENCODE.standard;
  const inputs = [], chains = [];
  plan.pieces.forEach((p, k) => {
    inputs.push('-i', p.file);
    chains.push(`[${k}:v]trim=start_frame=${p.source}:end_frame=${p.source + p.frames},setpts=PTS-STARTPTS,format=yuv422p10le[p${k}]`);
  });
  const n = plan.pieces.length;
  // Timestamps from the frame count on both streams, so frame n of the picture always meets
  // frame n of the caption layer (the concat's own timestamps drift against the layer's).
  chains.push(`${plan.pieces.map((_, k) => `[p${k}]`).join('')}concat=n=${n}:v=1:a=0,settb=1/${plan.fps},setpts=N[base]`);
  let last = '[base]';
  if (plan.overlay) {
    inputs.push('-i', plan.overlay.file);
    chains.push(`[${n}:v]settb=1/${plan.fps},setpts=N[layer]`);
    chains.push(`${last}[layer]overlay=format=yuv444:shortest=0:eof_action=pass[ov]`);
    last = '[ov]';
  }
  chains.push(`${last}format=yuv420p[v]`);
  const audio = mix ? ['-i', mix] : [];
  const aIndex = n + (plan.overlay ? 1 : 0);
  const vcodec = format === 'webm'
    ? ['-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(q.crf + 12), '-row-mt', '1']
    : codec === 'h265'
      ? ['-c:v', 'libx265', '-crf', String(q.crf + 2), '-preset', q.preset, '-tag:v', 'hvc1']
      : ['-c:v', 'libx264', '-crf', String(q.crf), '-preset', q.preset, '-profile:v', 'high'];
  await fsp.mkdir(path.dirname(out), { recursive: true });
  const tmp = out + '.part' + path.extname(out);
  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, ...audio, '-filter_complex', chains.join(';'), '-map', '[v]',
    ...(mix ? ['-map', `${aIndex}:a`, '-c:a', format === 'webm' ? 'libopus' : 'aac', '-b:a', '192k'] : []),
    ...vcodec, '-r', String(plan.fps), '-g', String(plan.fps * 2), '-color_range', 'tv', '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-frames:v', String(plan.total), ...(mix ? ['-t', String(plan.total / plan.fps)] : []),
    ...(format === 'mp4' ? ['-movflags', '+faststart'] : []), tmp]);
  await fsp.rename(tmp, out);
  return out;
}
