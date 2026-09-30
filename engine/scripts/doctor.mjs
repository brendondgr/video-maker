#!/usr/bin/env node
// Check that everything the engine needs is installed, and say how to fix what is not.
//   node doctor.mjs [--tts]     --tts also runs `kokoro-tts --check` / `breeze-tts --check` (loads each model)
//   node doctor.mjs --timeline  also checks the timeline converters (timeline.mjs --to) load
// ✖ = required and missing · ▲ = optional feature unavailable (HyperFrames engine, narration)
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGINE_DIR, SKILL_DIR, which, launchBrowser, parseArgs } from './lib/common.mjs';
import { HF_BIN, HF_VERSION } from './lib/hf.mjs';
import { otioEnv, OTIO_SETUP } from './lib/otioenv.mjs';
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
// Speech: kokoro-tts (default), breeze-tts (non-commercial), and the optional LocalTTS app.
const setup = `bash ${path.join(SKILL_DIR, 'tts', 'setup.sh')} --plan   (explains what this machine needs; Windows: tts\\install.ps1)`;
const engines = [
  { name: 'kokoro', cmd: process.env.VM_TTS || 'kokoro-tts', what: 'narration via voiceover.mjs (default voice)' },
  { name: 'breeze', cmd: process.env.VM_BREEZE_TTS || 'breeze-tts', what: 'provider "breeze": voice clone/design, non-commercial' },
];
for (const e of engines) e.found = !!(await which(e.cmd));
for (const e of engines) opt(e.found, `${e.cmd} on PATH (${e.what})`, setup);
opt(!!(await which('espeak-ng')), 'espeak-ng (Kokoro fallback for unknown words)', 'dnf/apt/pacman install espeak-ng · brew install espeak-ng · winget install eSpeak-NG.eSpeak-NG');
{
  const url = (process.env.LOCALTTS_URL || 'http://127.0.0.1:5040').replace(/\/+$/, '');
  let up = false; try { const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(1500) }); up = r.ok; } catch { /* down */ }
  opt(up, `LocalTTS reachable at ${url} (provider "localtts")`, 'optional app: an always-on TTS API + web UI (`localtts start`, or set LOCALTTS_URL)');
}
// Optional: timeline converters for other editors (timeline.mjs --to; the .otio itself needs nothing).
{
  const env = otioEnv();
  let detail = '';
  if (env.found && args.timeline) {
    const r = spawnSync(env.python, ['-c', 'import opentimelineio as o; m={a.name for a in o.plugins.ActiveManifest().adapters}; print(o.__version__, ",".join(n for n in ["fcp_xml","fcpx_xml","mlt_xml","kdenlive","cmx_3600","AAF","otioz"] if n in m))'], { encoding: 'utf8' });
    const [ver, ads] = (r.stdout || '').trim().split(' ');
    opt(r.status === 0, `opentimelineio ${ver || '?'} loads (adapters: ${ads || 'none'})`, `${OTIO_SETUP}   (re-run to repair)`);
    for (const need of ['fcp_xml', 'fcpx_xml', 'mlt_xml', 'cmx_3600', 'AAF']) if (r.status === 0 && !(ads || '').split(',').includes(need)) opt(false, `adapter ${need}`, OTIO_SETUP);
  } else detail = env.found ? ` (${env.python}; --timeline to test it)` : '';
  opt(env.found, `timeline converters for Final Cut / Shotcut / OpenShot / Lightworks / Avid / EDL${detail}`, OTIO_SETUP);
}
if (args.tts) {
  for (const e of engines.filter((x) => x.found)) {
    console.log(`  running ${e.cmd} --check …`);
    const r = spawnSync(e.cmd, ['--check'], { encoding: 'utf8', shell: process.platform === 'win32' });
    console.log((r.stderr || '').split('\n').filter((l) => /torch|RTF|device/.test(l)).map((l) => '    ' + l).join('\n'));
    opt(r.status === 0, `${e.cmd} synthesizes`, 'see the output above and references/install.md § troubleshooting');
  }
}
console.log(ok ? '\nAll good.' : '\nFix the ✖ items above.');
process.exit(ok ? 0 : 1);
