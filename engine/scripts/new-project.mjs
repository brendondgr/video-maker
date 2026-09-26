#!/usr/bin/env node
// Scaffold a new video project from templates/project.
//   node new-project.mjs <dir> [--title "..."] [--preset 1080p|4k|vertical|square|portrait|cinema]
//                             [--width W --height H] [--fps 30] [--duration 60] [--mode open|directed] [--force]
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, readJSON, writeJSON, SKILL_DIR, ENGINE_DIR } from './lib/common.mjs';

const args = parseArgs();
const dir = path.resolve(args._[0] || '');
if (!args._[0]) { console.error('usage: new-project.mjs <dir> [--title ...] [--preset 1080p]'); process.exit(2); }
if (fs.existsSync(path.join(dir, 'storyboard.json')) && !args.force) { console.error(`${dir} already has a storyboard.json (use --force to overwrite)`); process.exit(1); }
const catalog = await readJSON(path.join(ENGINE_DIR, 'catalog.json'));
const preset = catalog.presets[args.preset || '1080p'];
if (!preset) { console.error('unknown preset; have: ' + Object.keys(catalog.presets).join(', ')); process.exit(2); }

await fsp.cp(path.join(SKILL_DIR, 'templates', 'project'), dir, { recursive: true, force: !!args.force });
const sbPath = path.join(dir, 'storyboard.json');
const sb = await readJSON(sbPath);
sb.canvas.width = +(args.width || preset.width);
sb.canvas.height = +(args.height || preset.height);
sb.canvas.fps = +(args.fps || preset.fps);
if (args.title) { sb.meta.title = args.title; sb.meta.slug = args.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }
if (args.mode) sb.meta.mode = args.mode;
if (args.duration) sb.target_duration = +args.duration;
if (preset.render_height) sb.meta.render_height = preset.render_height;
await writeJSON(sbPath, sb);
for (const d of ['assets', 'out', 'qa']) await fsp.mkdir(path.join(dir, d), { recursive: true });
console.log(`✔ created ${dir}  (${sb.canvas.width}×${sb.canvas.height} @ ${sb.canvas.fps}fps${preset.render_height ? `, render with --height ${preset.render_height}` : ''})`);
console.log('  next: fill brief.md → storyboard.json → scenes/*.js → qa → render');
