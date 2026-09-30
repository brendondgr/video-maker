#!/usr/bin/env node
// Show the edit package's clip plan: every scene, transition and overlay clip, where it sits on
// the timeline, and whether it is fresh or must be re-rendered.
//
//   node segments.mjs <project> [--json] [--edit-codec prores] [--handles 1]
import path from 'node:path';
import { parseArgs, projectDir, readJSON, fmtTime } from './lib/common.mjs';
import { planStatus, editSettings } from './lib/segments.mjs';

const args = parseArgs();
const dir = projectDir(args);
const sb = await readJSON(path.join(dir, 'storyboard.json'));
const e = editSettings(sb, args);
const { plan, items } = planStatus(sb, dir, { fps: +(args.fps || sb.canvas?.fps || 30), handles: e.handles, codec: e.codec });
if (args.json) { console.log(JSON.stringify({ plan, items: items.map(({ file, key, stale, kind, id }) => ({ file: path.relative(dir, file), key, stale, kind, id })) }, null, 2)); process.exit(0); }
const tc = (f) => fmtTime(f / plan.fps);
const track = { scene: 'V1', transition: 'V2', overlay: 'V3' };
console.log(`▶ ${path.basename(dir)}: ${plan.total} frames at ${plan.fps} fps · ${plan.scenes.length} scenes, ${plan.transitions.length} transitions${plan.overlay ? ', overlay layer' : ''} · ${e.codec}, ${e.handles}s handles`);
for (const it of items) {
  console.log(`  ${it.stale ? '●' : '○'} ${track[it.kind]}  ${tc(it.timeline.start)}–${tc(it.timeline.end)}  ${String(it.media.frames).padStart(5)} fr  ${path.relative(dir, it.file)}${it.stale ? '  (stale)' : ''}`);
}
const stale = items.filter((i) => i.stale).length;
console.log(`  ${stale ? `● ${stale} clip(s) to render` : '○ all clips fresh'}`);
