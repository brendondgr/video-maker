#!/usr/bin/env node
// Gate 3c — scene isolation. The edit package renders every scene on its own (?solo=<id>), so a
// scene must look the same alone as it does inside the whole video. For each scene, frames at a
// few scene-local times outside its transition windows are captured both ways (overlays off)
// and compared pixel by pixel.
//
//   node check-isolation.mjs <project> [--samples 3] [--tolerance 0.0001] [--verbose] [--json]
//
// --tolerance is the share of pixels allowed to differ (default 0.01 %, about 200 pixels at
// 1080p): enough for anti-aliasing noise, small enough to catch one changed digit.
//
// A failure almost always means the scene reads or changes something outside itself: another
// scene's DOM, a global set by an earlier scene, or state kept in a helper between scenes.
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, printFindings, serve, launchBrowser, openComposition, isMain, diffImages } from './lib/common.mjs';
import { projectPaths } from './lib/paths.mjs';

export async function checkIsolation(dir, opts = {}) {
  const F = [];
  const add = (level, code, msg, extra = {}) => F.push({ level, code, msg, ...extra });
  const sb = await readJSON(path.join(dir, 'storyboard.json'));
  const canvas = Object.assign({ width: 1920, height: 1080, fps: 30 }, sb.canvas);
  const n = +(opts.samples || 3), tol = +(opts.tolerance ?? 0.0001);
  const server = await serve(dir);
  const browser = await launchBrowser(opts);
  const size = { width: canvas.width, height: canvas.height };
  const shot = (page) => page.screenshot({ type: 'png', clip: { x: 0, y: 0, ...size }, animations: 'disabled', caret: 'hide' });
  try {
    const full = await openComposition(browser, server.url, { ...size, layer: 'scenes' });
    if (!full.info.ready) { add('error', 'BOOT', 'composition did not start: ' + full.info.errors.join('; ')); return { findings: F }; }
    const scenes = full.info.scenes;
    let compared = 0;
    for (const [i, s] of scenes.entries()) {
      // Scene-local window not covered by the incoming or the outgoing transition.
      const a = i > 0 ? scenes[i - 1].end - s.start : 0;
      const b = i < scenes.length - 1 ? scenes[i + 1].start - s.start : s.duration;
      const lo = a + 0.1, hi = b - 0.1;
      if (hi <= lo) { add('info', 'ISOLATION', 'scene is entirely inside transitions; not compared', { scene: s.id }); continue; }
      const solo = await openComposition(browser, server.url, { ...size, solo: s.id });
      if (!solo.info.ready) { add('error', 'SOLO_BOOT', `scene does not build alone: ${solo.info.errors.join('; ')}`, { scene: s.id }); await solo.context.close(); continue; }
      solo.info.errors.forEach((e) => add('error', 'SOLO_RUNTIME', e, { scene: s.id }));
      let worst = null;
      for (let k = 0; k < n; k++) {
        const t = +(lo + (hi - lo) * (n === 1 ? 0.5 : k / (n - 1))).toFixed(3);
        await full.page.evaluate((x) => window.__vm.seek(x), s.start + t);
        await solo.page.evaluate((x) => window.__vm.seek(x), t);
        const d = await diffImages(browser, await shot(full.page), await shot(solo.page));
        compared++;
        if (!worst || d.fraction > worst.fraction) worst = { ...d, t };
        if (opts.verbose) console.log(`  ${s.id} @${t}: ${(d.fraction * 100).toFixed(4)}% differ, max delta ${d.maxDelta}`);
      }
      await solo.context.close();
      if (worst.fraction > tol) {
        add('error', 'ISOLATION', `renders differently alone than in the video: ${(worst.fraction * 100).toFixed(3)}% of pixels differ at ${worst.t}s (box ${worst.bbox?.join(',')}) — the scene depends on something outside itself`, { scene: s.id, t: s.start + worst.t });
      }
    }
    await full.context.close();
    if (!F.some((f) => f.level === 'error')) add('info', 'ISOLATION', `${scenes.length} scene(s) render the same alone (${compared} frames compared)`);
    return { findings: F };
  } finally {
    await browser.close();
    await server.close();
  }
}

if (isMain(import.meta.url)) {
  const args = parseArgs();
  const dir = projectDir(args);
  const res = await checkIsolation(dir, args);
  await writeJSON(path.join(projectPaths(dir).qa, 'isolation.json'), res);
  if (args.json) console.log(JSON.stringify(res, null, 2));
  const n = printFindings('Gate 3c · scene isolation', res.findings);
  process.exit(n.error ? 1 : 0);
}
