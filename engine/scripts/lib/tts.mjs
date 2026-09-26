// Speech providers for voiceover.mjs. Every provider turns [{id, text, wav, json}] into a WAV per
// item plus a timings JSON ({duration, sample_rate, words: [{w, start, end}]}), so retiming and
// captions work the same whichever voice made the audio.
//
//   auto      (default) LocalTTS if it is running, else kokoro-tts / breeze-tts, whichever the
//             voice needs (a Kokoro name → Kokoro; a saved voice or an instruction → Breeze)
//   kokoro    `kokoro-tts --batch` (local, fast, Apache-2.0)
//   breeze    `breeze-tts --batch` (local, voice clone / design / direction; NON-COMMERCIAL weights)
//   localtts  a running LocalTTS server (this machine or a forwarded remote GPU), either engine
//
// Install everything with tts/setup.sh (it inspects the machine first; LocalTTS included).
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeJSON, which } from './common.mjs';
import { writeWav } from './audio.mjs';

export const PROVIDERS = ['auto', 'kokoro', 'breeze', 'localtts'];
const KOKORO_VOICE = /^[ab][fm]_[a-z]+$/;

/** Which model will speak: kokoro or breeze (whatever the transport). */
export function engineFor(vo) {
  if (vo.provider === 'kokoro' || vo.provider === 'breeze') return vo.provider;
  if (vo.engine && vo.engine !== 'auto') return vo.engine;
  if (vo.voice) return KOKORO_VOICE.test(vo.voice) ? 'kokoro' : 'breeze';
  return vo.instruction ? 'breeze' : 'kokoro';
}

/** Everything that changes the audio, for the clip cache key. Keyed by engine, not transport:
 *  Kokoro through LocalTTS and through kokoro-tts is the same model and the same audio. */
export function voiceKey(vo) {
  const engine = engineFor(vo);
  if (engine === 'kokoro') return ['kokoro', vo.voice || 'af_heart', vo.speed, vo.lang].join('␟');   // same key as before
  return ['breeze', vo.voice, vo.instruction, vo.seed, vo.cfg_scale].map((x) => x ?? '').join('␟');
}

const localUrl = (vo) => (vo.url || process.env.LOCALTTS_URL || 'http://127.0.0.1:5040').replace(/\/+$/, '');
async function reachable(url) {
  try { const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) }); return r.ok; } catch { return false; }
}

/** Resolve provider "auto": LocalTTS when it is up (preferred), else the local command. */
export async function resolveProvider(vo) {
  if (vo.provider !== 'auto') return vo;
  if (await reachable(localUrl(vo))) return { ...vo, provider: 'localtts' };
  const engine = engineFor(vo);
  const cmd = engine === 'kokoro' ? (process.env.VM_TTS || 'kokoro-tts') : (process.env.VM_BREEZE_TTS || 'breeze-tts');
  if (await which(cmd)) return { ...vo, provider: engine, voice: engine === 'kokoro' ? (vo.voice || 'af_heart') : vo.voice };
  throw new Error(`no speech engine for this voice: LocalTTS is not running at ${localUrl(vo)} and ${cmd} is not installed. ` +
    `Start LocalTTS (localtts start), or set up the engines: bash tts/setup.sh --plan (see references/install.md §2)`);
}

export function voiceLabel(vo) {
  const engine = engineFor(vo);
  const v = vo.voice || (vo.instruction ? `designed: "${vo.instruction}"` : 'af_heart');
  return `${v} (${engine}${vo.provider === 'localtts' ? ' via LocalTTS' : ''})`;
}

function runBatch(cmd, argv) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: ['ignore', 'pipe', 'inherit'], shell: process.platform === 'win32' });
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('error', (e) => reject(new Error(`could not run ${cmd} (${e.message}). Install it: bash tts/setup.sh (see references/install.md)`)));
    p.on('close', (c) => (c === 0 ? resolve(out) : reject(new Error(`${cmd} exited ${c}`))));
  });
}

async function viaCli(cmd, job, items, clipDir) {
  job.items = items.map((it) => ({ id: it.id, text: it.text, out: path.basename(it.wav), timings: path.basename(it.json) }));
  const jobFile = path.join(clipDir, 'job.json');
  await writeJSON(jobFile, job);
  try { await runBatch(cmd, ['--batch', jobFile]); } finally { await fsp.rm(jobFile, { force: true }); }
}

// Breeze performs these as sounds; Kokoro would read them out, so they are removed for it.
const TAG_RE = /\s*[([]\s*(laughs?|sighs?|coughs?|clears throat|chuckle|giggle|gasp|groan|sniff|breath|hmm|cry)\s*[)\]]\s*/gi;
export const stripTags = (text) => text.replace(TAG_RE, ' ').replace(/\s{2,}/g, ' ').trim();

/** Timings spread by word length: a fallback when nothing can align the audio. */
export function estimateTimings(text, duration) {
  const words = stripTags(text).split(/\s+/).filter(Boolean);
  const lens = words.map((w) => Math.max(1, w.replace(/[^\p{L}\p{N}]/gu, '').length));
  const total = lens.reduce((a, b) => a + b, 0) || 1, t0 = Math.min(0.1, duration / 4), span = Math.max(0, duration - 2 * t0);
  let t = t0;
  return words.map((w, i) => { const d = (span * lens[i]) / total, o = { w, start: +t.toFixed(3), end: +(t + d).toFixed(3) }; t += d; return o; });
}

async function viaLocalTTS(vo, items, log) {
  const base = localUrl(vo);
  if (!(await reachable(base))) throw new Error(`LocalTTS is not reachable at ${base} (start it with \`localtts start\`, set audio.voiceover.url, or use provider kokoro/breeze)`);
  const engine = engineFor(vo);
  if (engine === 'breeze' && !vo.voice && vo.instruction) {
    log('  ! a designed voice through LocalTTS changes from clip to clip; save it once (LocalTTS: Voices → Design voice) and use its name, or use provider breeze');
  }
  const pending = [];   // clips that still need word timings
  for (const it of items) {
    const body = { text: engine === 'kokoro' ? stripTags(it.text) : it.text, engine: vo.engine || 'auto', no_save: true,
                   seed: vo.seed ?? 42, speed: vo.speed ?? 1, format: 'wav' };
    if (vo.voice) body.name = vo.voice;
    if (vo.instruction && engine === 'breeze') body.instruction = vo.instruction;
    if (vo.cfg_scale != null) body.cfg_scale = vo.cfg_scale;
    if (engine === 'kokoro') body.timings = true; else body.stream = true;   // Kokoro knows its word times
    const r = await fetch(`${base}/v1/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`LocalTTS ${r.status}: ${await r.text()}`);
    let duration, rate;
    if ((r.headers.get('content-type') || '').includes('json')) {
      const j = await r.json();
      fs.mkdirSync(path.dirname(it.wav), { recursive: true });
      fs.writeFileSync(it.wav, Buffer.from(j.audio, 'base64'));
      rate = j.sample_rate; duration = j.timings.duration;
      await writeJSON(it.json, j.timings);
    } else {
      rate = +r.headers.get('x-sample-rate') || 24000;
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.headers.get('content-type')?.includes('pcm')) {
        const samples = new Float32Array(buf.length >> 1);
        for (let i = 0; i < samples.length; i++) samples[i] = buf.readInt16LE(i * 2) / 32768;
        writeWav(it.wav, samples, rate); duration = samples.length / rate;
      } else { fs.writeFileSync(it.wav, buf); duration = +r.headers.get('x-audio-duration') || (buf.length - 44) / 2 / rate; }
      pending.push({ it, rate, duration });
    }
    log(`  ${it.id}: ${duration.toFixed(2)}s (${r.headers.get('x-localtts-engine') || engine}/${r.headers.get('x-localtts-voice') || vo.voice || 'default'})`);
  }
  if (!pending.length) return;
  // Word timings for the rest: one /v1/align call (one Whisper load on the server).
  let aligned = null;
  try {
    const form = new FormData();
    form.append('items', JSON.stringify(pending.map(({ it }) => ({ id: it.id, text: it.text }))));
    for (const { it } of pending) form.append(`audio_${it.id}`, new Blob([fs.readFileSync(it.wav)], { type: 'audio/wav' }), `${it.id}.wav`);
    const r = await fetch(`${base}/v1/align`, { method: 'POST', body: form });
    if (r.ok) aligned = (await r.json()).items;
    else log(`  ! LocalTTS could not align (${r.status}); word timings are estimated, so cues and captions are approximate`);
  } catch (e) { log(`  ! LocalTTS alignment failed (${e.message}); word timings are estimated`); }
  for (const { it, rate, duration } of pending) {
    await writeJSON(it.json, aligned?.[it.id] || { duration, sample_rate: rate, words: estimateTimings(it.text, duration), estimated: true });
  }
}

/** Synthesize `items` ([{id, text, wav, json}]) with the storyboard's voice settings. */
export async function synthesize(vo, items, clipDir, log = console.log) {
  if (!PROVIDERS.includes(vo.provider)) throw new Error(`audio.voiceover.provider must be one of ${PROVIDERS.join(', ')} (got "${vo.provider}")`);
  vo = await resolveProvider(vo);
  if (vo.provider === 'kokoro') {
    return viaCli(process.env.VM_TTS || 'kokoro-tts', { voice: vo.voice, speed: vo.speed, lang: vo.lang },
      items.map((it) => ({ ...it, text: stripTags(it.text) })), clipDir);
  }
  if (vo.provider === 'breeze') {
    if (!vo.voice && !vo.instruction) throw new Error('provider breeze needs audio.voiceover.voice (a saved voice: breeze-tts --voices) or .instruction (a voice description)');
    if (vo.speed && vo.speed !== 1) log(`  ! Breeze has no speed control; speed ${vo.speed} is ignored (say "brisk" or "slow" in the instruction instead)`);
    return viaCli(process.env.VM_BREEZE_TTS || 'breeze-tts', { voice: vo.voice, instruction: vo.instruction, seed: vo.seed ?? 42, cfg_scale: vo.cfg_scale ?? null }, items, clipDir);
  }
  return viaLocalTTS(vo, items, log);
}
