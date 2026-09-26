// Speech providers for voiceover.mjs. Every provider turns [{id, text, wav, json}] into a WAV per
// item plus a timings JSON ({duration, sample_rate, words: [{w, start, end}]}), so retiming and
// captions work the same whichever voice made the audio.
//
//   kokoro    `kokoro-tts --batch` (local, fast, Apache-2.0; the default)
//   breeze    `breeze-tts --batch` (local, voice clone / design / direction; NON-COMMERCIAL weights)
//   localtts  a running LocalTTS server (this machine or a forwarded remote GPU), either engine
//
// Install kokoro/breeze with tts/setup.sh; LocalTTS is a separate, optional app.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { writeJSON } from './common.mjs';
import { writeWav } from './audio.mjs';

export const PROVIDERS = ['kokoro', 'breeze', 'localtts'];

/** Everything that changes the audio, for the clip cache key. */
export function voiceKey(vo) {
  const base = [vo.provider, vo.voice, vo.speed, vo.lang];
  if (vo.provider === 'kokoro') return base.join('␟');   // unchanged, so existing Kokoro clips stay cached
  return [...base, vo.instruction, vo.seed, vo.cfg_scale, vo.engine].map((x) => x ?? '').join('␟');
}

export function voiceLabel(vo) {
  if (vo.provider === 'kokoro') return `${vo.voice} (kokoro)`;
  const v = vo.voice || (vo.instruction ? `designed: "${vo.instruction}"` : 'default');
  return `${v} (${vo.provider}${vo.provider === 'localtts' ? `/${vo.engine || 'auto'}` : ''})`;
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
  const base = (vo.url || process.env.LOCALTTS_URL || 'http://127.0.0.1:5040').replace(/\/+$/, '');
  try { const h = await fetch(`${base}/health`); if (!h.ok) throw new Error(h.statusText); }
  catch { throw new Error(`LocalTTS is not reachable at ${base} (start it with \`localtts start\`, set audio.voiceover.url, or use provider kokoro/breeze)`); }
  if ((vo.engine || 'auto') !== 'kokoro' && !vo.voice && vo.instruction) {
    log(`  ! a designed voice through LocalTTS changes from clip to clip; save it once (LocalTTS: Voices → Design voice) and use its name, or use provider breeze`);
  }
  const clips = [];
  for (const it of items) {
    const body = { text: it.text, engine: vo.engine || 'auto', stream: true, no_save: true, seed: vo.seed ?? 42, speed: vo.speed ?? 1 };
    if (vo.voice) body.name = vo.voice;
    if (vo.instruction) body.instruction = vo.instruction;
    if (vo.cfg_scale != null) body.cfg_scale = vo.cfg_scale;
    const r = await fetch(`${base}/v1/speech`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`LocalTTS ${r.status}: ${await r.text()}`);
    const rate = +r.headers.get('x-sample-rate') || 24000;
    const pcm = Buffer.from(await r.arrayBuffer());
    const samples = new Float32Array(pcm.length >> 1);
    for (let i = 0; i < samples.length; i++) samples[i] = pcm.readInt16LE(i * 2) / 32768;
    writeWav(it.wav, samples, rate);
    clips.push({ it, rate, duration: samples.length / rate });
    log(`  ${it.id}: ${(samples.length / rate).toFixed(2)}s (${r.headers.get('x-localtts-engine')}/${r.headers.get('x-localtts-voice')})`);
  }
  // Word timings: one /v1/align call for every clip (one Whisper load on the server).
  let aligned = null;
  try {
    const form = new FormData();
    form.append('items', JSON.stringify(clips.map(({ it }) => ({ id: it.id, text: it.text }))));
    for (const { it } of clips) form.append(`audio_${it.id}`, new Blob([fs.readFileSync(it.wav)], { type: 'audio/wav' }), `${it.id}.wav`);
    const r = await fetch(`${base}/v1/align`, { method: 'POST', body: form });
    if (r.ok) aligned = (await r.json()).items;
    else log(`  ! LocalTTS could not align (${r.status}); word timings are estimated, so cues and captions are approximate`);
  } catch (e) { log(`  ! LocalTTS alignment failed (${e.message}); word timings are estimated`); }
  for (const { it, rate, duration } of clips) {
    const t = aligned?.[it.id] || { duration, sample_rate: rate, words: estimateTimings(it.text, duration), estimated: true };
    await writeJSON(it.json, t);
  }
}

/** Synthesize `items` ([{id, text, wav, json}]) with the storyboard's voice settings. */
export async function synthesize(vo, items, clipDir, log = console.log) {
  if (!PROVIDERS.includes(vo.provider)) throw new Error(`audio.voiceover.provider must be one of ${PROVIDERS.join(', ')} (got "${vo.provider}")`);
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
