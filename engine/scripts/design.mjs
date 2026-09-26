#!/usr/bin/env node
// Apply a HyperFrames design preset (or any frame.md / design.md spec) to a project.
//
//   node design.mjs --list                                   show the vendored presets
//   node design.mjs <project> --preset blue-professional     map colours + fonts into storyboard.style
//   node design.mjs <project> --spec path/to/frame.md        same, from your own spec file
//   options: --no-fonts (skip downloading web fonts) · --dry-run (print the mapping only)
//
// The spec's YAML frontmatter (see vendor/hyperframes/skills/hyperframes-creative/references/
// design-spec.md) is mapped onto video-maker tokens: palette bg/surface/ink/muted/line/accent/
// accent-2/accent-3/warn and fonts sans (body) / display (headings) / mono / serif. Key names differ
// between presets, so the mapping uses synonyms and prints what it chose. Review it. Web fonts are
// downloaded once into <project>/assets/fonts/ (Fontsource via jsDelivr) with @font-face rules in
// style.css, so renders stay offline. The preset's prose is copied to <project>/design.md; read
// it for composition rules.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, SKILL_DIR } from './lib/common.mjs';

const PRESETS = path.join(SKILL_DIR, 'vendor', 'hyperframes', 'skills', 'hyperframes-creative', 'frame-presets');
const BUNDLED = { 'inter': "'Inter Variable'", 'jetbrains mono': "'JetBrains Mono Variable'", 'source serif 4': "'Source Serif 4 Variable'" };
const SYN = {
  bg: ['bg', 'background', 'canvas', 'paper', 'bg-primary', 'cream', 'base'],
  surface: ['surface', 'card-bg', 'card', 'paper-2', 'bg-secondary', 'cream-2', 'panel', 'accent-light'],
  ink: ['text', 'ink', 'fg', 'foreground', 'text-primary'],
  muted: ['text-muted', 'muted', 'ink-soft', 'text-secondary', 'secondary-text', 'text-light'],
  line: ['border', 'line', 'rule', 'grid', 'divider', 'ink-faint'],
  accent: ['primary', 'accent', 'brand', 'highlight', 'pink'],
  'accent-2': ['secondary', 'accent-2', 'positive', 'green', 'ink-soft', 'accent-medium'],
  'accent-3': ['tertiary', 'accent-3', 'pink-deep', 'green-lite'],
  warn: ['negative', 'warn', 'error', 'danger', 'red']
};

function frontmatter(md) {
  const m = /^---\n([\s\S]*?)\n---/.exec(md);
  if (!m) throw new Error('spec has no YAML frontmatter');
  const out = {}; let block = null;
  for (const line of m[1].split('\n')) {
    const top = /^([a-z][\w-]*):\s*(.*)$/i.exec(line);
    if (top) { block = top[1]; out[block] = top[2] && !top[2].startsWith('>') ? top[2].replace(/^"|"$/g, '') : {}; continue; }
    const kv = /^\s+([\w-]+):\s*(.+?)(\s+#\s.*)?$/.exec(line);   // '# comment' needs a space; "#fff" is a value
    if (kv && block && typeof out[block] === 'object') {
      let v = kv[2];
      if (v.startsWith('{')) { const ff = /fontFamily:\s*"([^"]+)"/.exec(v); v = { fontFamily: ff && ff[1], raw: v }; }
      else v = v.replace(/^"|"$/g, '');
      out[block][kv[1]] = v;
    }
  }
  return out;
}

const args = parseArgs();
if (args.list) {
  for (const p of fs.readdirSync(PRESETS).sort()) {
    const d = /description:\s*>\s*\n([\s\S]*?)\n\S/.exec(fs.readFileSync(path.join(PRESETS, p, 'FRAME.md'), 'utf8'));
    console.log(`${p.padEnd(18)} ${(d ? d[1].replace(/\s+/g, ' ').trim() : '').slice(0, 110)}`);
  }
  process.exit(0);
}
const dir = projectDir(args);
const specFile = args.spec ? path.resolve(args.spec) : path.join(PRESETS, String(args.preset || ''), 'FRAME.md');
if (!fs.existsSync(specFile)) throw new Error(`no spec at ${specFile} (try --list)`);
const md = await fsp.readFile(specFile, 'utf8');
const fm = frontmatter(md);
const colors = fm.colors || {};

const palette = {}, used = {};
for (const [tok, keys] of Object.entries(SYN)) {
  const k = keys.find((x) => colors[x] && !Object.values(used).includes(x));
  if (k) { palette[tok] = colors[k]; used[tok] = k; }
}
const typo = fm.typography || {};
const fam = (...names) => { for (const n of names) if (typo[n]?.fontFamily) return typo[n].fontFamily; return null; };
const families = {
  sans: fam('body', 'body-lg', 'paragraph', 'text'),
  display: fam('h1', 'display', 'hero', 'h2', 'headline', 'title'),
  mono: fam('mono', 'code', 'label', 'counter', 'tag')
};
if (!families.sans) families.sans = Object.values(typo).map((t) => t?.fontFamily).find(Boolean) || null;

console.log(`▶ ${path.basename(path.dirname(specFile))}: palette`);
for (const [t, k] of Object.entries(used)) console.log(`   ${t.padEnd(9)} ← ${k.padEnd(14)} ${palette[t]}`);
for (const t of Object.keys(SYN)) if (!used[t]) console.log(`   ${t.padEnd(9)} (kept current value)`);
console.log(`  fonts: sans=${families.sans || '-'} display=${families.display || '-'} mono=${families.mono || '-'}`);
if (args['dry-run']) process.exit(0);

// Fonts: bundled ones by name; others downloaded once as variable latin woff2 from Fontsource.
const fontCss = [];
const fontsDir = path.join(dir, 'assets', 'fonts');
async function fontStack(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (BUNDLED[key]) return `${BUNDLED[key]}, '${name}', system-ui, sans-serif`;
  const slug = key.replace(/[^a-z0-9]+/g, '-');
  const file = path.join(fontsDir, `${slug}-latin-wght.woff2`);
  if (!fs.existsSync(file) && !args['no-fonts']) {
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${slug}:vf@latest/latin-wght-normal.woff2`;
    const res = await fetch(url);
    if (!res.ok) { console.warn(`  ! could not fetch ${name} (${res.status}); falling back to Inter`); return null; }
    await fsp.mkdir(fontsDir, { recursive: true });
    await fsp.writeFile(file, Buffer.from(await res.arrayBuffer()));
    console.log(`  ↓ ${name} → ${path.relative(dir, file)}`);
  }
  if (!fs.existsSync(file)) return null;
  const rule = `@font-face { font-family: '${name}'; src: url('assets/fonts/${path.basename(file)}') format('woff2'); font-weight: 100 900; font-display: block; }`;
  if (!fontCss.includes(rule)) fontCss.push(rule);
  return `'${name}', system-ui, sans-serif`;
}

const sbPath = path.join(dir, 'storyboard.json');
const sb = await readJSON(sbPath);
sb.style = sb.style || {};
sb.style.palette = Object.assign({}, sb.style.palette || {}, palette);
sb.style.fonts = Object.assign({}, sb.style.fonts || {});
for (const [k, v] of Object.entries(families)) { const st = await fontStack(v); if (st) sb.style.fonts[k] = st; }
sb.style.design = { source: path.relative(SKILL_DIR, specFile), applied: new Date().toISOString().slice(0, 10) };
if (palette.bg) { sb.canvas = sb.canvas || {}; sb.canvas.background = palette.bg; }
await writeJSON(sbPath, sb);

if (fontCss.length) {
  const cssPath = path.join(dir, 'style.css');
  let css = fs.existsSync(cssPath) ? await fsp.readFile(cssPath, 'utf8') : '';
  css = css.replace(/\/\* design fonts:start \*\/[\s\S]*?\/\* design fonts:end \*\/\n?/, '');
  css = `/* design fonts:start */\n${fontCss.join('\n')}\n/* design fonts:end */\n` + css;
  await fsp.writeFile(cssPath, css);
}
await fsp.copyFile(specFile, path.join(dir, 'design.md'));
console.log(`✔ style applied to storyboard.json${fontCss.length ? ' + @font-face in style.css' : ''}; spec copied to design.md`);
