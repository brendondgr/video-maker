#!/usr/bin/env node
// Check that everything the engine needs is installed, and say how to fix what is not.
import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_DIR, which, launchBrowser, parseArgs } from './lib/common.mjs';
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
console.log(ok ? '\nAll good.' : '\nFix the ✖ items above.');
process.exit(ok ? 0 : 1);
