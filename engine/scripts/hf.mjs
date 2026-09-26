#!/usr/bin/env node
// Run the pinned HyperFrames CLI on a video-maker project.
//
//   node hf.mjs <project> <command> [hyperframes args…] [--telemetry]
//
//   node hf.mjs videos/x lint                  static checks
//   node hf.mjs videos/x check --json          lint + runtime layout/contrast/motion sweep
//   node hf.mjs videos/x render -o out/x.mp4 --quality delivery
//   node hf.mjs videos/x preview               HyperFrames Studio on this project
//   node hf.mjs videos/x snapshot --at 1,5,9
//   node hf.mjs videos/x transcribe audio/voiceover.wav
//   node hf.mjs . doctor | docs | catalog --query chart | tts … | remove-background …
//
// The project is synced first (_engine link + root data-* attributes from storyboard.json), so
// every hyperframes command sees the same composition our own scripts render. Telemetry is
// disabled (HYPERFRAMES_NO_TELEMETRY=1) unless --telemetry is passed.
import fs from 'node:fs';
import path from 'node:path';
import { syncProject, runHF, HF_VERSION } from './lib/hf.mjs';

const argv = process.argv.slice(2);
const telemetry = argv.includes('--telemetry');
const rest = argv.filter((a) => a !== '--telemetry');
if (rest.length < 2) {
  console.error(`usage: hf.mjs <project> <hyperframes command> [args…]   (pinned hyperframes@${HF_VERSION})`);
  process.exit(2);
}
const dir = path.resolve(rest[0]);
if (fs.existsSync(path.join(dir, 'storyboard.json'))) syncProject(dir);
const { code } = await runHF(dir, rest.slice(1), { telemetry });
process.exit(code ?? 1);
