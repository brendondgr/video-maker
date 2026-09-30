#!/usr/bin/env node
// Set a video's look: palette + fonts in storyboard.style, and the art direction in style.look.
// Every video gets its own look, derived from its subject, audience and tone. There is no house
// palette (references/motion-design.md § Choosing a look).
//
//   node design.mjs --list                                        presets: light/dark, colours, fonts
//   node design.mjs <project> --bg "#f3ede2" --accent "#b4441c"    a custom look from its key colours
//        [--ink --surface --muted --line --accent-2 --accent-3 --warn]   (missing ones are derived)
//        [--sans "Work Sans" --display "Fraunces" --mono … --serif …]  (any Fontsource family)
//   node design.mjs <project> --preset coral                      a HyperFrames frame preset
//   node design.mjs <project> --spec path/to/frame.md             same, from your own spec file
//   look:    --look "<name>" --mood "<3-5 mood words>" --why "<why this look fits this video>"
//   --tweak  change only the colours given, keep the rest of the current look
//   options: --no-fonts (skip downloading web fonts) · --dry-run (print the result only)
//
// Custom mode derives the tokens you leave out: ink leans toward the background's hue, surface /
// line / muted are mixes of bg and ink, missing accents are hue rotations of the main accent.
// Preset mode maps the spec's YAML frontmatter (hyperframes-creative/references/design-spec.md)
// onto the tokens by synonym, then derives whatever the preset lacks. Both print the palette
// with contrast against bg; fix any ✖ before building. Web fonts are downloaded once into
// <project>/assets/fonts/ (Fontsource via jsDelivr) with @font-face rules in style.css, so renders
// stay offline. A preset's prose is copied to <project>/design.md; read it for composition rules.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { parseArgs, projectDir, readJSON, writeJSON, SKILL_DIR } from './lib/common.mjs';
import { TOKENS, parseHex, isDark, chroma, completePalette, contrastReport } from './lib/color.mjs';

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

function mapSpec(file) {
  const fm = frontmatter(fs.readFileSync(file, 'utf8'));
  const colors = fm.colors || {};
  const palette = {}, used = {};
  for (const [tok, keys] of Object.entries(SYN)) {
    const k = keys.find((x) => parseHex(colors[x]) && !Object.values(used).includes(x));
    if (k) { palette[tok] = colors[k]; used[tok] = k; }
  }
  // Presets name their brand colours freely (coral, cobalt, yellow…). Accents nothing matched by
  // name go to the most colourful remaining colours, so no accent is left to a stale default.
  const spare = Object.entries(colors).filter(([k, v]) => parseHex(v) && !Object.values(used).includes(k)
    && !Object.values(palette).includes(v) && chroma(v) > 0.25).sort((a, b) => chroma(b[1]) - chroma(a[1]));
  for (const tok of ['accent', 'accent-2', 'accent-3']) {
    if (palette[tok] || !spare.length) continue;
    const [k, v] = spare.shift(); palette[tok] = v; used[tok] = k;
  }
  const typo = fm.typography || {};
  const fam = (...names) => { for (const n of names) if (typo[n]?.fontFamily) return typo[n].fontFamily; return null; };
  const families = {
    sans: fam('body', 'body-lg', 'paragraph', 'text'),
    display: fam('h1', 'display', 'hero', 'h2', 'headline', 'title'),
    mono: fam('mono', 'code', 'label', 'counter', 'tag')
  };
  if (!families.sans) families.sans = Object.values(typo).map((t) => t?.fontFamily).find(Boolean) || null;
  return { palette, used, families };
}

const args = parseArgs();
if (args.list) {
  console.log('Starting points only: a look should come from the video (motion-design.md § Choosing a look).\n');
  for (const p of fs.readdirSync(PRESETS).sort()) {
    const { palette: pal, families: f } = mapSpec(path.join(PRESETS, p, 'FRAME.md'));
    const tone = pal.bg ? (isDark(pal.bg) ? 'dark ' : 'light') : '?    ';
    const fonts = [...new Set([f.display, f.sans].filter(Boolean))].join(' + ');
    console.log(`${p.padEnd(18)} ${tone}  bg ${pal.bg || '-'}  accent ${pal.accent || '-'}${pal['accent-2'] ? ' / ' + pal['accent-2'] : ''}  ${fonts}`);
  }
  process.exit(0);
}
const dir = projectDir(args);
const custom = TOKENS.filter((t) => args[t] != null);
let mapped = { palette: {}, used: {}, families: {} }, specFile = null;
if (args.preset || args.spec) {
  specFile = args.spec ? path.resolve(args.spec) : path.join(PRESETS, String(args.preset), 'FRAME.md');
  if (!fs.existsSync(specFile)) throw new Error(`no spec at ${specFile} (try --list)`);
  mapped = mapSpec(specFile);
} else if (!custom.length && !args.look && !args.mood && !args.why) {
  console.error('usage: design.mjs <project> (--bg <hex> --accent <hex> … | --preset <name> | --spec <file>) [--look --mood --why]');
  process.exit(2);
}
for (const t of custom) {
  if (!parseHex(args[t])) throw new Error(`--${t} "${args[t]}" is not a hex colour`);
  mapped.palette[t] = args[t]; mapped.used[t] = 'flag';
}
for (const k of ['sans', 'display', 'mono', 'serif']) if (typeof args[k] === 'string') mapped.families[k] = args[k];

const sbPath = path.join(dir, 'storyboard.json');
const sb = await readJSON(sbPath);
sb.style = sb.style || {};
// A new look replaces the palette: nothing from the previous one leaks in. --tweak changes only the
// given tokens of the current look. With no colours given, only style.look's text is updated.
const colourless = !specFile && !custom.length;
const base = colourless || args.tweak ? Object.assign({}, sb.style.palette || {}, mapped.palette) : { ...mapped.palette };
if (!parseHex(base.bg) || !parseHex(base.accent)) throw new Error('a look needs at least bg and accent: pass --bg/--accent (a monochrome preset needs --accent alongside --preset)');
const { palette, derived } = completePalette(base);

console.log(`▶ look${specFile ? ' from ' + path.basename(path.dirname(specFile)) : ''}: ${isDark(palette.bg) ? 'dark' : 'light'} background`);
const report = Object.fromEntries(contrastReport(palette).map((r) => [r.token, r]));
for (const t of TOKENS) {
  const src = mapped.used[t] === 'flag' ? 'given' : mapped.used[t] ? 'preset ' + mapped.used[t] : derived.includes(t) ? 'derived' : 'current look';
  const c = report[t];
  const cr = c ? `${c.ok ? '✔' : '✖'} ${c.ratio.toFixed(1)}:1 on bg (min ${c.min})` : '';
  console.log(`   ${t.padEnd(9)} ${palette[t]}  ${src.padEnd(22)} ${cr}`);
}
const fams = mapped.families;
console.log(`  fonts: ${['sans', 'display', 'mono', 'serif'].map((k) => `${k}=${fams[k] || '(unchanged)'}`).join(' ')}`);
const bad = Object.values(report).filter((r) => !r.ok);
if (bad.length) console.log(`  ✖ low contrast: ${bad.map((r) => r.token).join(', ')}. Pass a lighter/darker value for each before building.`);
if (args['dry-run']) process.exit(0);

// Fonts: bundled ones by name; others downloaded once as variable latin woff2 from Fontsource.
const fontCss = [];
const fontsDir = path.join(dir, 'assets', 'fonts');
async function fontStack(name) {
  if (!name) return null;
  const key = name.toLowerCase();
  if (BUNDLED[key]) return `${BUNDLED[key]}, '${name}', system-ui, sans-serif`;
  const slug = key.replace(/[^a-z0-9]+/g, '-');
  // Variable font when Fontsource has one, else the static 400 and 700 cuts that exist.
  const cuts = [{ file: `${slug}-latin-wght.woff2`, url: `${slug}:vf@latest/latin-wght-normal.woff2`, weight: '100 900' },
    { file: `${slug}-latin-400.woff2`, url: `${slug}@latest/latin-400-normal.woff2`, weight: '400', static: true },
    { file: `${slug}-latin-700.woff2`, url: `${slug}@latest/latin-700-normal.woff2`, weight: '700', static: true }];
  const have = (c) => fs.existsSync(path.join(fontsDir, c.file));
  async function fetchCut(c) {
    if (have(c) || args['no-fonts']) return have(c);
    const res = await fetch('https://cdn.jsdelivr.net/fontsource/fonts/' + c.url);
    if (!res.ok) return false;
    await fsp.mkdir(fontsDir, { recursive: true });
    await fsp.writeFile(path.join(fontsDir, c.file), Buffer.from(await res.arrayBuffer()));
    console.log(`  ↓ ${name} ${c.weight} → assets/fonts/${c.file}`);
    return true;
  }
  const got = (await fetchCut(cuts[0])) ? [cuts[0]] : [];
  if (!got.length) for (const c of cuts.slice(1)) if (await fetchCut(c)) got.push(c);
  if (!got.length) { console.warn(`  ! no Fontsource files for ${name}; falling back to Inter`); return null; }
  for (const c of got) {
    const rule = `@font-face { font-family: '${name}'; src: url('assets/fonts/${c.file}') format('woff2'); font-weight: ${c.weight}; font-display: block; }`;
    if (!fontCss.includes(rule)) fontCss.push(rule);
  }
  return `'${name}', system-ui, sans-serif`;
}

sb.style.palette = palette;
sb.style.fonts = Object.assign({}, sb.style.fonts || {});
for (const [k, v] of Object.entries(fams)) { const st = await fontStack(v); if (st) sb.style.fonts[k] = st; }
const look = Object.assign({}, sb.style.look || {});
for (const k of ['look', 'mood', 'why']) if (typeof args[k] === 'string') look[k === 'look' ? 'name' : k] = args[k];
if (specFile) look.source = path.relative(SKILL_DIR, specFile) + (custom.length ? ' + custom' : '');
else if (custom.length && !args.tweak) look.source = 'custom';
look.set = new Date().toISOString().slice(0, 10);
sb.style.look = look;
delete sb.style.design;
sb.canvas = sb.canvas || {};
sb.canvas.background = palette.bg;
await writeJSON(sbPath, sb);

if (fontCss.length) {
  const cssPath = path.join(dir, 'style.css');
  let css = fs.existsSync(cssPath) ? await fsp.readFile(cssPath, 'utf8') : '';
  css = css.replace(/\/\* design fonts:start \*\/[\s\S]*?\/\* design fonts:end \*\/\n?/, '');
  css = `/* design fonts:start */\n${fontCss.join('\n')}\n/* design fonts:end */\n` + css;
  await fsp.writeFile(cssPath, css);
}
if (specFile) await fsp.copyFile(specFile, path.join(dir, 'design.md'));
console.log(`✔ look written to storyboard.json${fontCss.length ? ' + @font-face in style.css' : ''}${specFile ? '; spec copied to design.md' : ''}`);
if (!look.name || !look.why) console.log('  ▲ style.look has no name/why yet: add --look "<name>" --why "<why it fits>" (shown in PLAN.md)');
