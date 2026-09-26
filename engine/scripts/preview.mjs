#!/usr/bin/env node
// Serve a project for live preview (scrubber, scene markers, keyboard controls).
//   node preview.mjs <project> [--port 5173] [--host 127.0.0.1]
import path from 'node:path';
import { parseArgs, projectDir, serve } from './lib/common.mjs';
const args = parseArgs();
const dir = projectDir(args);
const s = await serve(dir, { port: +(args.port || 5173), host: args.host || '127.0.0.1', log: !!args.verbose });
console.log(`▶ previewing ${path.basename(dir)} at ${s.url}/index.html`);
console.log('  Space play/pause · ←/→ frame · Shift+←/→ 1s · [ ] scenes · ?t=12.5 · ?scene=id · ?loop');
console.log('  Reload the page after editing scene files. Ctrl+C to stop.');
