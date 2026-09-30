#!/usr/bin/env node
// Narrate, retime, caption and mix a project.
//
//   node voiceover.mjs <project> [--force] [--no-retime] [--mix-only] [--voice am_michael] [--speed 1.05]
//                               [--provider kokoro|breeze|localtts] [--instruction "…"]
//
// 1. Synthesize: every scene's `narration` → audio/vo/<scene>-<hash>.wav + word timings, through
//    audio.voiceover.provider (lib/tts.mjs): kokoro-tts (default), breeze-tts, or a LocalTTS
//    server. Clips are cached by text and every voice setting, so editing one line
//    re-synthesizes one clip.
// 2. Retime (audio.voiceover.retime = fit | extend | off): each scene's duration becomes what its
//    narration needs; beats with `cue` snap to words, other beats scale. The silent plan is kept
//    in scene.silent. storyboard.json is rewritten.
// 3. Assemble audio/voiceover.wav (clips placed at scene start + transition + pad_before), write
//    audio/timing.json and, when audio.captions.enabled, audio/captions.{json,srt,vtt}.
// 4. Mix audio/mix.wav: voice + optional music bed (ducked) + scene.sfx cues, mastered with
//    two-pass loudnorm. render.mjs uses it automatically; HyperFrames gets it as <audio id="vm-mix">.
// 5. Layout 2: write the edit package's stems (edit/audio/voice, music.wav, sfx/, stems.json).
// (Layout-2 locations: .build/voice/ for the cache, voiceover.wav and timing.json; edit/captions/
//  and edit/audio/mix.wav for the results; see lib/paths.mjs.)
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, fmtTime } from './lib/common.mjs';
import { syncProject, timelineTotal, sceneTimes } from './lib/hf.mjs';
import { voSettings, retime, readWav, writeWav, narrationLead, captionGroups, toSRT, toVTT, sfxCues, buildMix, writeStems, requiredDuration } from './lib/audio.mjs';
import { synthesize, voiceKey, voiceLabel, engineFor } from './lib/tts.mjs';
import { projectPaths } from './lib/paths.mjs';
import { writeReadme } from './lib/readme.mjs';

const args = parseArgs();
const dir = projectDir(args);
const sbPath = path.join(dir, 'storyboard.json');
const sb = await readJSON(sbPath);
sb.audio = sb.audio || {};
sb.audio.voiceover = Object.assign({ enabled: true }, sb.audio.voiceover || {});
if (args.voice) sb.audio.voiceover.voice = args.voice;
if (args.speed) sb.audio.voiceover.speed = +args.speed;
if (args.provider) sb.audio.voiceover.provider = args.provider;
if (args.instruction) sb.audio.voiceover.instruction = args.instruction;
const vo = voSettings(sb);
const P = projectPaths(dir, sb), clipDir = P.voiceCache;
await fsp.mkdir(clipDir, { recursive: true });
const findings = [];

// ---------------------------------------------------------------- 1. synthesize
const key = (s) => crypto.createHash('sha1').update([voiceKey(vo), s.narration.trim()].join('␟')).digest('hex').slice(0, 10);
const narrated = sb.scenes.filter((s) => s.narration && s.narration.trim());
const clips = Object.fromEntries(narrated.map((s) => {
  const h = key(s);
  return [s.id, { wav: path.join(clipDir, `${s.id}-${h}.wav`), json: path.join(clipDir, `${s.id}-${h}.json`) }];
}));
const todo = args['mix-only'] ? [] : narrated.filter((s) => args.force || !fs.existsSync(clips[s.id].wav) || !fs.existsSync(clips[s.id].json));

if (todo.length) {
  console.log(`▶ synthesizing ${todo.length} clip(s) with ${voiceLabel(vo)}${engineFor(vo) === 'kokoro' ? `, speed ${vo.speed}` : ''}`);
  if (engineFor(vo) === 'breeze') {
    console.log('  note: Breeze TTS 2 audio is licensed for research and non-commercial use only');
  }
  await synthesize(vo, todo.map((s) => ({ id: s.id, text: s.narration.trim(), wav: clips[s.id].wav, json: clips[s.id].json })), clipDir);
} else console.log(`▶ narration: ${narrated.length} clip(s) cached`);

// Drop clips from earlier wordings so the folder only holds what the storyboard says now.
const keep = new Set(Object.values(clips).flatMap((c) => [path.basename(c.wav), path.basename(c.json)]));
for (const f of await fsp.readdir(clipDir)) if (!keep.has(f)) await fsp.rm(path.join(clipDir, f), { force: true });

const timing = { voice: vo.voice, speed: vo.speed, provider: vo.provider, instruction: vo.instruction, scenes: {} };
for (const s of narrated) {
  const t = await readJSON(clips[s.id].json);
  timing.scenes[s.id] = { file: path.relative(dir, clips[s.id].wav), duration: t.duration, words: t.words };
}

// ---------------------------------------------------------------- 2. retime
if (vo.retime !== 'off' && !args['no-retime']) {
  const rep = retime(sb, timing);
  for (const r of rep) if (r.warn) findings.push({ level: 'warn', code: 'CUE', scene: r.id, msg: r.warn });
  const moved = rep.filter((r) => r.to != null && Math.abs(r.to - r.from) > 0.01);
  console.log(`▶ retimed ${moved.length} scene(s) to narration → total ${fmtTime(timelineTotal(sb))}`);
  sb.target_duration = Math.round(timelineTotal(sb) * 10) / 10;
}
await writeJSON(sbPath, sb);
syncProject(dir);

// Narration must end before the next scene starts transitioning in.
sb.scenes.forEach((s, i) => {
  const c = timing.scenes[s.id];
  if (c && s.duration + 1e-3 < requiredDuration(sb, i, c.duration, vo)) {
    findings.push({ level: 'error', code: 'NARRATION_CUT', scene: s.id,
      msg: `narration ${c.duration.toFixed(2)}s needs ${requiredDuration(sb, i, c.duration, vo).toFixed(2)}s but scene is ${s.duration}s (retime is ${vo.retime})` });
  }
});

// ---------------------------------------------------------------- 3. assemble + captions
const T = timelineTotal(sb), times = sceneTimes(sb);
let rate = 24000, voiceFile = null;
if (narrated.length) {
  const loaded = narrated.map((s) => ({ s, w: readWav(clips[s.id].wav) }));
  rate = loaded[0].w.rate;
  const buf = new Float32Array(Math.ceil(T * rate) + 1);
  for (const { s, w } of loaded) {
    if (w.rate !== rate) throw new Error(`clip ${s.id} is ${w.rate} Hz, expected ${rate}`);
    const i = sb.scenes.indexOf(s);
    const at = Math.round((times[i].start + narrationLead(sb, i, vo)) * rate);
    for (let k = 0; k < w.samples.length && at + k < buf.length; k++) buf[at + k] += w.samples[k];
  }
  voiceFile = P.voiceWav;
  writeWav(voiceFile, buf, rate);
}
await writeJSON(P.timing, timing);

if (sb.audio.captions?.enabled && narrated.length) {
  const groups = captionGroups(sb, timing);
  await writeJSON(P.captions.json, { groups });
  await fsp.writeFile(P.captions.srt, toSRT(groups));
  await fsp.writeFile(P.captions.vtt, toVTT(groups));
  console.log(`▶ captions: ${groups.length} cards → ${P.rel.captionsDir}/captions.{json,srt,vtt}`);
}

// ---------------------------------------------------------------- 4. mix
const { cues, problems } = sfxCues(sb, dir);
for (const p of problems) findings.push({ level: 'error', code: 'SFX', msg: p });
const m = await buildMix({ dir, sb, voiceFile, music: sb.audio.music, sfx: cues, out: P.mix, premix: P.premix, keepPremix: P.layout >= 2 });
syncProject(dir);
console.log(`▶ mix: ${m.tracks} track(s), ${cues.length} sfx cue(s), ${fmtTime(m.duration)} → ${P.rel.mix} (${m.lufs.toFixed(1)} LUFS, TP ${m.true_peak.toFixed(1)} dBTP)`);
if (Math.abs(m.lufs - vo.loudness) > 1.5) findings.push({ level: 'warn', code: 'LOUDNESS', msg: `integrated ${m.lufs.toFixed(1)} LUFS vs target ${vo.loudness}` });
// Layout 2: stems for the edit package (A1 voice per scene, A2 music, A3 sfx).
if (P.layout >= 2) {
  const voice = narrated.map((s) => { const i = sb.scenes.indexOf(s); return { id: s.id, wav: clips[s.id].wav, at: +(times[i].start + narrationLead(sb, i, vo)).toFixed(3), duration: timing.scenes[s.id].duration }; });
  const st = await writeStems({ dir, sb, P, voice, voiceFile, music: sb.audio.music, sfx: cues, gainDb: m.gain_db });
  console.log(`▶ stems: ${st.voice.length} voice, ${st.music ? 1 : 0} music, ${st.sfx.length} sfx → ${P.rel.editAudio}/ (48 kHz float, ${st.gain_db >= 0 ? '+' : ''}${st.gain_db.toFixed(1)} dB mastering gain)`);
}
if (m.true_peak > vo.true_peak + 0.5) findings.push({ level: 'warn', code: 'TRUE_PEAK', msg: `true peak ${m.true_peak.toFixed(1)} dBTP above ${vo.true_peak}` });

writeReadme(dir, sb);
const words = narrated.reduce((n, s) => n + s.narration.trim().split(/\s+/).length, 0);
findings.push({ level: 'info', code: 'VOICE', msg: `${narrated.length} clip(s), ${words} words over ${fmtTime(T)} (${(words / T).toFixed(2)} w/s overall)` });
const c = printFindings('Voice-over', findings);
if (c.error) process.exit(1);
