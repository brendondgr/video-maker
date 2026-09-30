// Audio plumbing for the voice-over phase: WAV I/O, retiming scenes to narration, caption
// grouping, SFX lookup and the FFmpeg mix/master. Pure functions where possible so
// validate-storyboard.mjs and voiceover.mjs agree on every number.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { SKILL_DIR, run } from './common.mjs';
import { sceneTimes, timelineTotal } from './hf.mjs';

export const SFX_DIR = path.join(SKILL_DIR, 'vendor', 'hyperframes', 'skills', 'media-use', 'audio', 'assets', 'sfx');

export const VO_DEFAULTS = {
  provider: 'auto',     // auto: LocalTTS if running, else kokoro-tts/breeze-tts · kokoro · breeze · localtts (lib/tts.mjs)
  voice: 'af_heart', speed: 1.0, lang: 'a',
  instruction: null,    // breeze/localtts: describe the voice (no voice) or the delivery (with a voice)
  seed: 42, cfg_scale: null,
  url: null, engine: 'auto',   // localtts: server URL (default $LOCALTTS_URL or :5040) and engine
  pad_before: 0.3,      // silence after the scene's own transition, before narration starts
  pad_after: 0.5,       // breathing room after the last word, before the next transition begins
  retime: 'fit',        // fit: duration = what narration needs · extend: never shorter than planned · off
  loudness: -16,        // integrated LUFS target (−14 for social feeds)
  true_peak: -1.5
};
export const CAPTION_DEFAULTS = { enabled: false, max_words: 6, min_gap: 0.15, min_card: 0.9, style: 'clean', position: 'bottom' };

export function voSettings(sb) {
  const own = sb.audio?.voiceover || {};
  const vo = Object.assign({}, VO_DEFAULTS, own);
  // af_heart is a Kokoro voice: drop it when the settings ask for Breeze (a design needs no voice).
  if (!('voice' in own) && (vo.provider === 'breeze' || (own.instruction && vo.provider !== 'kokoro'))) vo.voice = null;
  return vo;
}

// ------------------------------------------------------------------ WAV (PCM16 / float32)
export function readWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WAVE') throw new Error(`${file}: not a WAV`);
  let off = 12, fmt = null, data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4), size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { format: b.readUInt16LE(off + 8), channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size & 1);
  }
  if (!fmt || !data) throw new Error(`${file}: missing fmt/data chunk`);
  const n = Math.floor(data.length / (fmt.bits / 8) / fmt.channels);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let acc = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const j = (i * fmt.channels + c) * (fmt.bits / 8);
      acc += fmt.format === 3 ? data.readFloatLE(j) : fmt.bits === 16 ? data.readInt16LE(j) / 32768 : data.readInt32LE(j) / 2147483648;
    }
    out[i] = acc / fmt.channels;
  }
  return { rate: fmt.rate, samples: out, duration: n / fmt.rate };
}

export function writeWav(file, samples, rate) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(rate, 24); b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, b);
}

// ------------------------------------------------------------------ timing
const norm = (w) => String(w).toLowerCase().replace(/[^a-z0-9]+/g, '');
const frameCeil = (s, fps) => Math.ceil(s * fps - 1e-6) / fps;
const r3 = (x) => Math.round(x * 1000) / 1000;

/** Index of the first word where `phrase` starts, or -1. */
export function findPhrase(words, phrase) {
  const want = String(phrase).split(/\s+/).map(norm).filter(Boolean);
  if (!want.length) return -1;
  outer: for (let i = 0; i + want.length <= words.length; i++) {
    for (let k = 0; k < want.length; k++) if (norm(words[i + k].w) !== want[k]) continue outer;
    return i;
  }
  return -1;
}

/** Where narration starts inside a scene (scene-local seconds). */
export function narrationLead(sb, i, vo = voSettings(sb)) {
  const s = sb.scenes[i];
  const tr = i === 0 ? 0 : (+s.transition_in?.duration || 0);
  return r3(tr + (s.voice?.pad_before ?? vo.pad_before));
}

/** Minimum scene duration so its narration finishes before the next scene's transition. */
export function requiredDuration(sb, i, clipDur, vo = voSettings(sb)) {
  const s = sb.scenes[i], next = sb.scenes[i + 1];
  const trNext = next ? (+next.transition_in?.duration || 0) : 0;
  const pad = s.voice?.pad_after ?? vo.pad_after;
  return narrationLead(sb, i, vo) + clipDur + pad + trNext + (+s.hold || 0);
}

/**
 * Retime storyboard scenes to their narration clips (mutates and returns sb).
 * The first retime stores the silent plan in scene.silent so later runs start from it.
 * Beats with `cue: "word:N"` / `"text:phrase"` land on that word (+ beat.offset);
 * other beats scale with the scene.
 */
export function retime(sb, timing, { fps = sb.canvas?.fps || 30 } = {}) {
  const vo = voSettings(sb);
  const report = [];
  sb.scenes.forEach((s, i) => {
    const clip = timing.scenes?.[s.id];
    if (!s.silent) s.silent = { duration: s.duration, beats: Object.fromEntries((s.beats || []).map((b) => [b.id, b.t])) };
    const base = s.silent;
    if (!clip) { report.push({ id: s.id, from: base.duration, to: s.duration, note: 'no narration' }); return; }
    const need = requiredDuration(sb, i, clip.duration, vo);
    let dur = vo.retime === 'extend' ? Math.max(base.duration, need) : need;
    dur = r3(frameCeil(Math.max(dur, sb.rules?.min_scene_duration || 1.5), fps));
    const k = dur / base.duration, lead = narrationLead(sb, i, vo);
    for (const b of s.beats || []) {
      const t0 = base.beats[b.id] ?? b.t;
      let t = t0 * k;
      if (b.cue) {
        const m = /^(word|text):(.+)$/.exec(b.cue);
        const idx = !m ? -1 : m[1] === 'word' ? Math.min(+m[2], clip.words.length - 1) : findPhrase(clip.words, m[2]);
        if (idx >= 0 && clip.words[idx]) t = lead + clip.words[idx].start + (+b.offset || 0);
        else report.push({ id: s.id, warn: `beat "${b.id}" cue "${b.cue}" not found in narration; scaled instead` });
      }
      b.t = r3(Math.max(0, Math.min(t, dur - 0.05)));
    }
    report.push({ id: s.id, from: base.duration, to: dur, narration: clip.duration, lead });
    s.duration = dur;
  });
  return report;
}

/** Composition-time word list per scene (for captions, ducking, checks). */
export function placedWords(sb, timing) {
  const vo = voSettings(sb), times = sceneTimes(sb);
  return sb.scenes.map((s, i) => {
    const clip = timing.scenes?.[s.id];
    if (!clip) return { id: s.id, start: null, words: [] };
    const at = times[i].start + narrationLead(sb, i, vo);
    return { id: s.id, start: at, end: at + clip.duration, words: clip.words.map((w) => ({ w: w.w, start: r3(at + w.start), end: r3(at + w.end) })) };
  });
}

// ------------------------------------------------------------------ captions
/** Group words into caption cards (HF rules: sentence / pause / max-words breaks, never across scenes). */
export function captionGroups(sb, timing) {
  const cfg = Object.assign({}, CAPTION_DEFAULTS, sb.audio?.captions || {});
  const groups = [];
  for (const sc of placedWords(sb, timing)) {
    // Hard breaks: sentence ends, pauses, and a comma once a phrase is long enough.
    const runs = [];
    let cur = [];
    sc.words.forEach((w, j) => {
      const prev = sc.words[j - 1];
      if (cur.length && (/[.!?;:]$/.test(prev.w) || w.start - prev.end >= cfg.min_gap || (/,$/.test(prev.w) && cur.length >= 3))) { runs.push(cur); cur = []; }
      cur.push(w);
    });
    if (cur.length) runs.push(cur);
    // Split long runs into near-equal chunks (no orphaned last word), but never so many that a
    // card is on screen for less than min_card seconds (readability beats the word cap).
    for (const run of runs) {
      let n = Math.ceil(run.length / cfg.max_words);
      const span = run[run.length - 1].end - run[0].start;
      while (n > 1 && span / n < cfg.min_card) n--;
      const size = Math.ceil(run.length / n);
      for (let k = 0; k < run.length; k += size) groups.push({ scene: sc.id, words: run.slice(k, k + size) });
    }
  }
  return groups.map((g, i) => {
    const next = groups[i + 1];
    const last = g.words[g.words.length - 1];
    const end = Math.min(last.end + 0.3, next ? next.words[0].start - 0.02 : last.end + 0.6);
    return { i, scene: g.scene, text: g.words.map((w) => w.w).join(' '), start: g.words[0].start, end: r3(Math.max(end, last.end)), words: g.words };
  });
}

const stamp = (s, sep) => {
  const ms = Math.round(s * 1000), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, sec = Math.floor(ms / 1000) % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}${sep}${String(ms % 1000).padStart(3, '0')}`;
};
export function toSRT(groups) {
  return groups.map((g, i) => `${i + 1}\n${stamp(g.start, ',')} --> ${stamp(g.end, ',')}\n${g.text}\n`).join('\n');
}
export function toVTT(groups) {
  return 'WEBVTT\n\n' + groups.map((g) => `${stamp(g.start, '.')} --> ${stamp(g.end, '.')}\n${g.text}\n`).join('\n');
}

// ------------------------------------------------------------------ SFX
let _sfx = null;
export function sfxCatalog() {
  if (!_sfx) {
    const f = path.join(SFX_DIR, 'manifest.json');
    _sfx = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  }
  return _sfx;
}

/** Resolve every scene.sfx cue to { src, at (composition s), volume }. */
export function sfxCues(sb, dir) {
  const times = sceneTimes(sb), cat = sfxCatalog(), out = [], problems = [];
  sb.scenes.forEach((s, i) => {
    for (const c of s.sfx || []) {
      const src = c.src ? path.resolve(dir, c.src) : cat[c.name] ? path.join(SFX_DIR, cat[c.name].file) : null;
      if (!src || !fs.existsSync(src)) { problems.push(`[${s.id}] sfx "${c.name || c.src}" not found`); continue; }
      let t = typeof c.at === 'number' ? c.at : c.at === 'end' ? s.duration : 0;
      if (typeof c.at === 'string' && c.at !== 'end') {
        const b = (s.beats || []).find((x) => x.id === c.at);
        if (!b) { problems.push(`[${s.id}] sfx beat "${c.at}" not found`); continue; }
        t = b.t;
      }
      out.push({ scene: s.id, name: c.name || path.basename(src), src, at: r3(Math.max(0, times[i].start + t + (+c.offset || 0))), volume: c.volume ?? 0.35 });
    }
  });
  return { cues: out, problems };
}

// ------------------------------------------------------------------ mix + master
async function measureLoudness(file, I, TP) {
  const { err } = await run('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', `loudnorm=I=${I}:TP=${TP}:LRA=11:print_format=json`, '-f', 'null', '-']);
  const j = err.slice(err.lastIndexOf('{'), err.lastIndexOf('}') + 1);
  return JSON.parse(j);
}

/**
 * Build audio/mix.wav: narration + optional music bed (sidechain-ducked under the voice, per
 * HF media-use/references/operations.md) + SFX cues, then two-pass loudnorm to the target.
 */
export async function buildMix({ dir, sb, voiceFile, music, sfx, out, premix, keepPremix = false }) {
  const T = timelineTotal(sb);
  const vo = voSettings(sb);
  const inputs = [], chains = [], mixIn = [];
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  if (voiceFile) { inputs.push('-i', voiceFile); chains.push(`[0:a]${fmt},apad,atrim=0:${T}[vo0]`); }
  let idx = inputs.length / 2;
  if (music?.src) {
    inputs.push('-stream_loop', '-1', '-i', path.resolve(dir, music.src));
    const bed = musicChains(music, idx, T, !!voiceFile, fmt);
    chains.push(...bed.chains);
    mixIn.push(...(voiceFile ? [bed.voice] : []), bed.out);
    idx++;
  } else if (voiceFile) mixIn.push('[vo0]');
  for (const [k, c] of sfx.entries()) {
    inputs.push('-i', c.src);
    const ms = Math.round(c.at * 1000);
    chains.push(`[${idx}:a]${fmt},volume=${c.volume},adelay=${ms}|${ms}[sx${k}]`);
    mixIn.push(`[sx${k}]`);
    idx++;
  }
  if (!mixIn.length) throw new Error('nothing to mix (no narration, music or sfx)');
  const graph = [...chains, `${mixIn.join('')}amix=inputs=${mixIn.length}:duration=longest:normalize=0,apad,atrim=0:${T}[mix]`].join(';');
  const pre = premix || path.join(path.dirname(out), '.premix.wav');
  await fsp.mkdir(path.dirname(pre), { recursive: true });
  await fsp.mkdir(path.dirname(out), { recursive: true });
  await run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', graph, '-map', '[mix]', '-c:a', 'pcm_s16le', '-ar', '48000', pre]);
  const I = vo.loudness, TP = vo.true_peak;
  const m = await measureLoudness(pre, I, TP);
  const ln = `loudnorm=I=${I}:TP=${TP}:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  await run('ffmpeg', ['-y', '-v', 'error', '-i', pre, '-af', `${ln},aresample=48000`, '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '2', out]);
  if (!keepPremix) await fsp.rm(pre, { force: true });
  const after = await measureLoudness(out, I, TP);
  // gain_db: what mastering added; stems carry it, so they sum to (about) the mix.
  return { duration: T, lufs: +after.input_i, true_peak: +after.input_tp, tracks: mixIn.length, gain_db: +after.input_i - +m.input_i };
}

// The music bed: level, trim, fades and (under narration) sidechain ducking keyed by [vo0].
// Returns the filter chains, the voice label to mix and the bed's output label.
function musicChains(music, idx, T, hasVoice, fmt) {
  const vol = music.volume ?? (hasVoice ? 0.12 : 0.9);
  const fadeOut = Math.max(0, T - (music.fade_out ?? 2.5));
  const chains = [`[${idx}:a]${fmt},atrim=0:${T},volume=${vol},afade=t=in:d=${music.fade_in ?? 1.5},afade=t=out:st=${fadeOut}:d=${music.fade_out ?? 2.5}[bg0]`];
  if (hasVoice && music.duck !== false) {
    chains.push('[vo0]asplit=2[vo][vokey]');
    chains.push('[bg0][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=200:release=400[bg]');
    return { chains, voice: '[vo]', out: '[bg]' };
  }
  return { chains, voice: '[vo0]', out: '[bg0]' };
}

/**
 * The edit package's audio stems (layout 2): edit/audio/voice/<scene>.wav, music.wav (the ducked
 * bed, full length), sfx/<nn>-<name>.wav (gain baked in), each 48 kHz 32-bit float stereo and
 * carrying the mastering gain, plus edit/audio/stems.json with where each one sits. The timeline
 * (timeline.mjs) places them on A1–A3. A stem is re-encoded only when its inputs change.
 * Everything starts on a whole frame: each voice stem is the voice track cut on its scene's V1
 * range (so it trims with the picture), and each sfx stem is padded to the frame before its cue.
 *   voice: [{ id, start, end }] (seconds, frame-aligned)  ·  sfx: sfxCues().cues  ·  gainDb: buildMix().gain_db
 */
export async function writeStems({ dir, sb, P, voice, voiceFile, music, sfx, gainDb, fps = sb.canvas?.fps || 30 }) {
  const T = timelineTotal(sb);
  const fmt = 'aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo';
  const g = `volume=${(+gainDb || 0).toFixed(3)}dB`;
  // 32-bit float: the mastering gain can push a stem past 0 dBFS, which float carries without
  // clipping (every target editor reads float WAV).
  const enc = ['-c:a', 'pcm_f32le', '-ar', '48000', '-ac', '2'];
  const prev = (() => { try { return JSON.parse(fs.readFileSync(path.join(P.editAudio, 'stems.json'), 'utf8')); } catch { return {}; } })();
  const seen = new Map([...(prev.voice || []), ...(prev.sfx || []), ...(prev.music ? [prev.music] : [])].map((s) => [s.file, s.key]));
  const stat = (f) => { try { const s = fs.statSync(f); return `${s.size}:${s.mtimeMs}`; } catch { return ''; } };
  const keyOf = (...x) => JSON.stringify(['f32', ...x]);
  const out = { sample_rate: 48000, duration: T, gain_db: +(+gainDb || 0).toFixed(3), voice: [], music: null, sfx: [], mix: path.relative(P.edit, P.mix) };
  const produce = async (file, key, argv) => {
    const rel = path.relative(P.edit, file);
    if (seen.get(rel) !== key || !fs.existsSync(file)) {
      await fsp.mkdir(path.dirname(file), { recursive: true });
      await run('ffmpeg', ['-y', '-v', 'error', ...argv, ...enc, file + '.part.wav']);
      await fsp.rename(file + '.part.wav', file);
    }
    return rel;
  };
  for (const v of voiceFile ? voice : []) {
    const file = path.join(P.editVoice, `${v.id}.wav`), key = keyOf(stat(voiceFile), v.start, v.end, gainDb);
    const af = `${fmt},apad,atrim=start=${v.start}:end=${v.end},asetpts=PTS-STARTPTS,${g}`;
    out.voice.push({ id: v.id, file: await produce(file, key, ['-i', voiceFile, '-af', af]), at: v.start, duration: +(v.end - v.start).toFixed(6), key });
  }
  if (music?.src) {
    const src = path.resolve(dir, music.src), file = P.editMusic;
    const key = keyOf(src, stat(src), music, T, gainDb, voiceFile && stat(voiceFile));
    const inputs = [...(voiceFile ? ['-i', voiceFile] : []), '-stream_loop', '-1', '-i', src];
    const bed = musicChains(music, voiceFile ? 1 : 0, T, !!voiceFile, fmt);
    const graph = [...(voiceFile ? [`[0:a]${fmt},apad,atrim=0:${T}[vo0]`] : []), ...bed.chains, ...(voiceFile ? [`${bed.voice}anullsink`] : []), `${bed.out}${g},apad,atrim=0:${T}[m]`].join(';');
    out.music = { file: await produce(file, key, [...inputs, '-filter_complex', graph, '-map', '[m]']), at: 0, duration: T, key };
  }
  for (const [k, c] of sfx.entries()) {
    const name = `${String(k + 1).padStart(2, '0')}-${String(c.name).toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-')}.wav`;
    const at = Math.floor(c.at * fps + 1e-6) / fps, lead = Math.round((c.at - at) * 48000);
    const file = path.join(P.editSfx, name), key = keyOf(c.src, stat(c.src), c.volume, gainDb, lead);
    const d = +(await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', c.src])).out.trim();
    const af = `${fmt},adelay=${lead}S:all=1,volume=${c.volume},${g}`;
    out.sfx.push({ scene: c.scene, name: c.name, file: await produce(file, key, ['-i', c.src, '-af', af]), at: +at.toFixed(6), duration: +(d + lead / 48000).toFixed(6), key });
  }
  // Latest only: drop stems that are no longer produced.
  const keep = new Set([...out.voice, ...out.sfx, ...(out.music ? [out.music] : [])].map((s) => path.resolve(P.edit, s.file)));
  for (const d of [P.editVoice, P.editSfx]) {
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d)) if (!keep.has(path.resolve(d, f))) await fsp.rm(path.join(d, f), { force: true });
  }
  if (!out.music) await fsp.rm(P.editMusic, { force: true });
  await fsp.writeFile(path.join(P.editAudio, 'stems.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}
