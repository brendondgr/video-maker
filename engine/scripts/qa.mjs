#!/usr/bin/env node
// Run gates 1–4 in order and write qa/report.md. Stops early on errors unless --keep-going.
//
//   node qa.mjs <project> [--keep-going] [--no-snapshot] [--no-determinism] [--samples 3]
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, projectDir, writeJSON, printFindings } from './lib/common.mjs';
import { validateStoryboard } from './validate-storyboard.mjs';
import { lint } from './lint.mjs';
import { check } from './check.mjs';
import { snapshot } from './snapshot.mjs';

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
