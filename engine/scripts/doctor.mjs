#!/usr/bin/env node
// Check that everything the engine needs is installed, and say how to fix what is not.
//   node doctor.mjs [--tts]     --tts also runs `kokoro-tts --check` (loads the model, times a sentence)
// ✖ = required and missing · ▲ = optional feature unavailable (HyperFrames engine, narration)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGINE_DIR, SKILL_DIR, which, launchBrowser, parseArgs } from './lib/common.mjs';
import { HF_BIN, HF_VERSION } from './lib/hf.mjs';
const args = parseArgs();
let ok = true;
const line = (good, what, fix) => { console.log(`${good ? '✔' : '✖'} ${what}${!good && fix ? `\n    fix: ${fix}` : ''}`); if (!good) ok = false; };
const major = +process.versions.node.split('.')[0];
line(major >= 18, `node ${process.versions.node} (need ≥ 18)`, 'install Node 18+');
line(!!(await which('ffmpeg')), 'ffmpeg on PATH', 'install ffmpeg (dnf install ffmpeg / apt install ffmpeg / brew install ffmpeg)');
line(!!(await which('ffprobe')), 'ffprobe on PATH', 'comes with ffmpeg');
const mods = ['gsap', 'd3', 'katex', 'three', 'roughjs', 'playwright', '@fontsource-variable/inter'];
for (const m of mods) line(fs.existsSync(path.join(ENGINE_DIR, 'node_modules', m)), `node_modules/${m}`, `cd ${ENGINE_DIR} && npm install`);
try {
  const b = await launchBrowser(args);
  const p = await b.newPage();
  const gl = await p.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); });
  line(true, `chromium launches (${b.version()})`);
  line(gl, 'WebGL available in headless Chromium (needed for 3D scenes)', 'try --chrome with a full Chrome build; 2D scenes still work');
  await b.close();
} catch (e) {
  line(false, 'chromium launches', `cd ${ENGINE_DIR} && npx playwright install chromium   (or pass --chrome /path/to/chrome, or set VM_CHROME)\n    ${e.message.split('\n')[0]}`);
}

// Optional: HyperFrames engine (render --engine hf, hf.mjs, QA gate 3b) and narration.
const opt = (good, what, fix) => console.log(`${good ? '✔' : '▲'} ${what}${!good && fix ? `\n    to enable: ${fix}` : ''}`);
opt(major >= 22, `node ${process.versions.node} for HyperFrames (needs ≥ 22)`, 'install Node 22+ (nvm install 22 / dnf install nodejs22 / brew install node@22)');
opt(fs.existsSync(HF_BIN), `hyperframes@${HF_VERSION} CLI (render --engine hf, hf.mjs, QA gate 3b)`, `cd ${ENGINE_DIR} && npm install`);
opt(fs.existsSync(path.join(SKILL_DIR, 'vendor', 'hyperframes', 'skills', 'hyperframes-core', 'SKILL.md')), 'vendored HyperFrames skills (references)', `node ${path.join(ENGINE_DIR, 'scripts', 'sync-hyperframes.mjs')}`);
// Optional: illustrations (images.mjs → bundled imagegen; references/images.md).
opt(!!(await which('jq')), 'jq (imagegen dispatcher)', 'dnf/apt/pacman install jq · brew install jq');
opt(!!(await which('codex')), 'codex CLI (image backend "codex")', 'npm i -g @openai/codex && codex login');
{
  const url = (process.env.COMFY_URL || 'http://127.0.0.1:8199') + '/system_stats';
  let up = false; try { const r = await fetch(url, { signal: AbortSignal.timeout(1500) }); up = r.ok; } catch { /* down */ }
  opt(up, `ComfyUI reachable at ${url.replace('/system_stats', '')} (image backend "comfy")`, 'comfyui start   (or set COMFY_URL); model families are install-specific: imagegen/reference/backends.md');
}
const tts = process.env.VM_TTS || 'kokoro-tts';
const hasTTS = !!(await which(tts));
opt(hasTTS, `${tts} on PATH (narration via voiceover.mjs)`, `bash ${path.join(SKILL_DIR, 'tts', 'install.sh')}   (Windows: tts\\install.ps1) — see references/install.md`);
opt(!!(await which('espeak-ng')), 'espeak-ng (Kokoro fallback for unknown words)', 'dnf/apt/pacman install espeak-ng · brew install espeak-ng · winget install eSpeak-NG.eSpeak-NG');
if (args.tts && hasTTS) {
  console.log('  running kokoro-tts --check …');
  const r = spawnSync(tts, ['--check'], { encoding: 'utf8', shell: process.platform === 'win32' });
  console.log((r.stderr || '').split('\n').filter((l) => /torch|RTF|device/.test(l)).map((l) => '    ' + l).join('\n'));
  opt(r.status === 0, 'kokoro-tts synthesizes', 'see the output above and references/install.md § troubleshooting');
}
console.log(ok ? '\nAll good.' : '\nFix the ✖ items above.');
process.exit(ok ? 0 : 1);
