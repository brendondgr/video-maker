#!/usr/bin/env node
// Refresh the vendored HyperFrames skills (knowledge the video-maker skill routes to).
//
//   node sync-hyperframes.mjs [--version 0.8.77] [--from /path/to/hyperframes-checkout]
//
// Copies the skills listed below from the heygen-com/hyperframes tag v<version> into
// vendor/hyperframes/skills/, plus LICENSE (Apache-2.0) and a VERSION file. Keep the version in
// step with engine/package.json and lib/hf.mjs (HF_VERSION), then re-run the parity check:
//   node render.mjs examples/gradient-descent --engine hf   vs   --engine vm
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs, run, SKILL_DIR } from './lib/common.mjs';
import { HF_VERSION } from './lib/hf.mjs';

export const VENDORED = [
  'hyperframes', 'hyperframes-core', 'hyperframes-cli', 'hyperframes-studio', 'hyperframes-keyframes',
  'hyperframes-animation', 'hyperframes-creative', 'hyperframes-registry', 'hyperframes-audio', 'media-use'
];

const args = parseArgs();
const version = String(args.version || HF_VERSION).replace(/^v/, '');
const dest = path.join(SKILL_DIR, 'vendor', 'hyperframes');

let src = args.from ? path.resolve(args.from) : null, tmp = null;
if (!src) {
  tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'hf-sync-'));
  src = path.join(tmp, 'hyperframes');
  console.log(`▶ fetching heygen-com/hyperframes v${version}`);
  await run('git', ['clone', '-q', '--depth', '1', '--branch', `v${version}`, '--filter=blob:none', '--sparse',
    'https://github.com/heygen-com/hyperframes.git', src]);
  await run('git', ['-C', src, 'sparse-checkout', 'set', '--no-cone', '/skills/', '/LICENSE']);
}

await fsp.rm(path.join(dest, 'skills'), { recursive: true, force: true });
await fsp.mkdir(path.join(dest, 'skills'), { recursive: true });
for (const name of VENDORED) {
  const from = path.join(src, 'skills', name);
  if (!fs.existsSync(from)) throw new Error(`skill ${name} not found in ${src}`);
  await fsp.cp(from, path.join(dest, 'skills', name), { recursive: true });
}
await fsp.copyFile(path.join(src, 'LICENSE'), path.join(dest, 'LICENSE'));
await fsp.writeFile(path.join(dest, 'VERSION'), `hyperframes v${version}\n`);
if (tmp) await fsp.rm(tmp, { recursive: true, force: true });
console.log(`✔ vendored ${VENDORED.length} skills from hyperframes v${version} → ${path.relative(process.cwd(), dest)}`);
