#!/usr/bin/env node
// Run gates 1–4 in order and write qa/report.md. Stops early on errors unless --keep-going.
//
//   node qa.mjs <project> [--keep-going] [--no-snapshot] [--no-determinism] [--samples 3] [--no-hf]
//
// Gate 3b runs HyperFrames' own `check` (lint + runtime + layout + motion + contrast sweep in
// Chrome) on the same composition. Its findings inside a transition window are downgraded to
// info (outgoing and incoming text overlap there by design).
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, projectDir, writeJSON, printFindings } from './lib/common.mjs';
import { validateStoryboard } from './validate-storyboard.mjs';
import { lint } from './lint.mjs';
import { check } from './check.mjs';
import { snapshot } from './snapshot.mjs';
import { runHF, sceneTimes, HF_BIN } from './lib/hf.mjs';
import fs from 'node:fs';

const args = parseArgs();
const dir = projectDir(args);
const report = { when: new Date().toISOString(), gates: [] };
let failed = false;

async function gate(name, fn) {
  if (failed && !args['keep-going']) { report.gates.push({ name, skipped: true }); return null; }
  try {
    const res = await fn();
    const n = printFindings(name, res.findings || []);
    report.gates.push({ name, errors: n.error, warnings: n.warn, findings: res.findings || [] });
    if (n.error) failed = true;
    return res;
  } catch (e) {
    console.error(`\n${name}: crashed — ${e.message}`);
    report.gates.push({ name, errors: 1, warnings: 0, findings: [{ level: 'error', code: 'CRASH', msg: e.message }] });
    failed = true;
    return null;
  }
}

await gate('Gate 1 · storyboard', () => validateStoryboard(dir));
await gate('Gate 2 · lint', () => lint(dir));
await gate('Gate 3 · runtime check', () => check(dir, { samples: args.samples, determinism: !args['no-determinism'], chrome: args.chrome }));
if (!args['no-hf'] && fs.existsSync(HF_BIN)) await gate('Gate 3b · HyperFrames check', () => hfCheck(dir));

async function hfCheck(dir) {
  const { stdout, stderr } = await runHF(dir, ['check', '--json'], { capture: true });
  let j;
  try { j = JSON.parse(stdout.slice(stdout.indexOf('{'))); }
  catch { return { findings: [{ level: 'warn', code: 'HF_CHECK', msg: 'hyperframes check produced no JSON: ' + (stderr || stdout).slice(-300) }] }; }
  const sb = JSON.parse(fs.readFileSync(path.join(dir, 'storyboard.json'), 'utf8'));
  const times = sceneTimes(sb);
  const sceneAt = (t) => { let id = null; for (const s of times) if (t >= s.start) id = s.id; return id; };
  const inTransition = (t) => times.some((s) => s.transition > 0 && t >= s.start - 0.05 && t <= s.start + s.transition + 0.05);
  const LV = { error: 'error', warning: 'warn', info: 'info' };
  const out = [];
  for (const sec of ['lint', 'runtime', 'layout', 'motion', 'contrast']) {
    for (const f of j[sec]?.findings || []) {
      const t = f.time ?? f.firstSeen;
      let level = LV[f.severity] || 'info';
      let msg = `${sec}: ${f.message}${f.selector ? ' (' + f.selector + (f.text ? ` "${String(f.text).slice(0, 40)}"` : '') + ')' : ''}`;
      if (t != null && level !== 'error' && inTransition(t)) { level = 'info'; msg += ' — during a transition'; }
      out.push({ level, code: 'HF_' + String(f.code || sec).toUpperCase(), msg, t, scene: t != null ? sceneAt(t) : undefined });
    }
  }
  out.push({ level: 'info', code: 'HF_CHECK', msg: `hyperframes check: ${j.ok ? 'ok' : 'not ok'} (lint ${j.lint?.errorCount ?? 0}E/${j.lint?.warningCount ?? 0}W, layout ${j.layout?.errorCount ?? 0}E/${j.layout?.warningCount ?? 0}W, contrast ${j.contrast?.errorCount ?? 0}E/${j.contrast?.warningCount ?? 0}W)` });
  return { findings: out };
}

let sheets = [];
if (!args['no-snapshot'] && (!failed || args['keep-going'])) {
  try {
    const s = await snapshot(dir, { chrome: args.chrome });
    sheets = s.sheets;
    report.gates.push({ name: 'Gate 4 · snapshots', sheets: sheets.map((p) => path.relative(dir, p)), stills: s.shots.length });
    console.log(`\nGate 4 · snapshots → ${sheets.map((p) => path.relative(process.cwd(), p)).join(', ')}`);
  } catch (e) { console.error('Gate 4 crashed: ' + e.message); failed = true; }
}

const md = ['# QA report', '', `Generated ${report.when}`, ''];
for (const g of report.gates) {
  md.push(`## ${g.name}`, '');
  if (g.skipped) { md.push('_skipped (earlier gate failed)_', ''); continue; }
  if (g.sheets) { md.push(`${g.stills} stills. Contact sheets:`, ...g.sheets.map((s) => `- ${s}`), '', '**Visual review is not automatic.** Open every sheet and score it with the rubric in references/validation.md.', ''); continue; }
  md.push(`${g.errors} error(s), ${g.warnings} warning(s)`, '');
  for (const f of g.findings.filter((x) => x.level !== 'info')) md.push(`- **${f.level}** \`${f.code}\` ${f.scene ? `[${f.scene}] ` : ''}${f.t != null ? `@${(+f.t).toFixed(2)}s ` : ''}${f.msg}`);
  md.push('');
}
md.push(failed ? '**Result: FAIL** — fix errors, then re-run qa.' : '**Result: PASS (automated gates)** — now do the visual review, then render a draft.');
await fsp.mkdir(path.join(dir, 'qa'), { recursive: true });
await fsp.writeFile(path.join(dir, 'qa', 'report.md'), md.join('\n') + '\n');
await writeJSON(path.join(dir, 'qa', 'report.json'), report);
console.log(`\n${failed ? '✖ QA FAILED' : '✔ QA passed (automated)'} — qa/report.md`);
process.exit(failed ? 1 : 0);
