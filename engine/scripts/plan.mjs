#!/usr/bin/env node
// Write the human-readable production plan (PLAN.md) and narration script (SCRIPT.md) for a
// project, from its storyboard. Show PLAN.md to the user at the storyboard checkpoint; re-run
// after voiceover.mjs and the timings become the real, voice-fitted ones.
//
//   node plan.mjs <project> [--wps 2.4]
//
// Chapters: a scene whose first on_screen_text entry is a two-digit number ("01", "02", …)
// opens a chapter titled by its second entry (the convention used by kit chapter cards).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, projectDir, readJSON } from './lib/common.mjs';
import { timelineTotal, sceneTimes } from './lib/hf.mjs';
import { projectPaths } from './lib/paths.mjs';
import { writeReadme } from './lib/readme.mjs';

const args = parseArgs();
const dir = projectDir(args);
const sb = await readJSON(path.join(dir, 'storyboard.json'));
const wps = +(args.wps || 2.4);
const vo = sb.audio?.voiceover || {};
const P = projectPaths(dir, sb);
const voiced = !!vo.enabled && fs.existsSync(P.timing) && sb.scenes.every((s) => s.silent);

const words = (t) => (t || '').trim().split(/\s+/).filter(Boolean).length;
const fmt = (t) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(1).padStart(4, '0')}`; };
const esc = (x) => String(x ?? '').replace(/\|/g, '\\|');

// Estimated durations before voice-over (narration at `wps` words/s plus pads and transitions).
const est = JSON.parse(JSON.stringify(sb));
if (!voiced) est.scenes.forEach((s, i) => {
  if (!s.narration) return;
  const next = est.scenes[i + 1]?.transition_in?.duration || 0;
  s.duration = Math.max(s.duration || 0, (s.transition_in?.duration || 0) + (vo.pad_before ?? 0.3) + words(s.narration) / wps + (vo.pad_after ?? 0.45) + next + (s.hold || 0));
});
const times = sceneTimes(est);
const total = timelineTotal(est);
const rows = est.scenes.map((s, i) => ({ s: sb.scenes[i], i, start: times[i].start, dur: est.scenes[i].duration }));
const totalWords = sb.scenes.reduce((a, s) => a + words(s.narration), 0);

const chapters = [];
rows.forEach((r) => {
  const ost = r.s.on_screen_text || [];
  if (/^\d\d$/.test(ost[0] || '')) chapters.push({ num: ost[0], title: ost[1], rows: [r] });
  else if (!chapters.length) chapters.push({ num: '00', title: 'Opening', rows: [r] });
  else chapters[chapters.length - 1].rows.push(r);
});
const multi = chapters.length > 1;

const imgs = sb.images?.items || [];
const trans = [...new Set(sb.scenes.map((s) => s.transition_in?.type).filter(Boolean))];
const sfx = sb.scenes.flatMap((s) => (s.sfx || []).map((x) => `${x.name} @ ${s.id}/${x.at}`));
const vtypes = {};
sb.scenes.forEach((s) => { vtypes[s.visual?.type] = (vtypes[s.visual?.type] || 0) + 1; });

let md = `# ${sb.meta?.title || path.basename(dir)}: production plan\n\n`;
md += `> ${voiced ? 'Timings are **final**, fitted to the synthesized narration.' : `Timings are **estimates** (narration at ${wps} words/s plus pads). The voice-over pass retimes every scene to the real narration.`}\n\n`;
md += `## Overview\n\n| | |\n|---|---|\n`;
md += `| Goal | ${esc(sb.meta?.goal)} |\n| Audience | ${esc(sb.meta?.audience)} |\n| Tone | ${esc(sb.meta?.tone)} |\n`;
md += `| Length | target ${fmt(sb.meta?.target_duration || sb.target_duration)} · ${voiced ? 'actual' : 'estimated'} **${fmt(total)}** |\n`;
md += `| Scenes | ${sb.scenes.length}${multi ? ` in ${chapters.length} chapters` : ''} |\n`;
md += `| Narration | ${totalWords} words${vo.enabled ? ` · voice \`${vo.voice}\` @ ${vo.speed || 1}×` : ' · silent'} · captions: ${sb.audio?.captions?.enabled ? sb.audio.captions.style || 'on' : 'off'} |\n`;
md += `| Canvas | ${sb.canvas.width}×${sb.canvas.height} @ ${sb.canvas.fps} fps |\n`;
{
  const look = sb.style?.look || {}, pal = sb.style?.palette || {};
  const sw = ['bg', 'surface', 'ink', 'accent', 'accent-2', 'accent-3'].filter((k) => pal[k]).map((k) => `${k} \`${pal[k]}\``).join(' · ');
  const fonts = [...new Set(['display', 'sans'].map((k) => (sb.style?.fonts?.[k] || '').split(',')[0].replace(/'/g, '').trim()).filter(Boolean))].join(' + ');
  md += `| Look | ${look.name ? `**${esc(look.name)}**` : '**not chosen**'}${look.mood ? ` (${esc(look.mood)})` : ''}${look.why ? `: ${esc(look.why)}` : ''} |\n`;
  md += `| Palette | ${sw || '(none)'}${fonts ? ` · type: ${fonts}` : ''} |\n`;
}
md += `| Transitions | ${trans.join(', ') || 'cut'} |\n| Visual types | ${Object.entries(vtypes).map(([k, v]) => `${k} ×${v}`).join(', ')} |\n`;
if (sb.meta?.sources?.length) md += `| Sources | ${esc(sb.meta.sources.join('; '))} |\n`;

md += `\n## Assets\n\n`;
if (imgs.length) {
  md += `**Generated illustrations** (${imgs.length}, \`images.mjs\` → imagegen, default backend \`${sb.images.backend || 'codex'}\`). All share this style key:\n\n`;
  md += `> ${sb.images.style || '(none)'}\n\n| Image | Backend | Used in | Prompt |\n|---|---|---|---|\n`;
  for (const it of imgs) {
    const used = sb.scenes.filter((s) => (s.assets || []).some((a) => a.includes(`/${it.name}.`))).map((s) => `\`${s.id}\``).join(', ') || '—';
    md += `| \`${it.name}\` | ${it.backend || sb.images.backend || 'codex'}${it.model ? '/' + it.model : ''} | ${used} | ${esc(it.prompt)} |\n`;
  }
  md += '\n';
}
md += `**Built in code** (SVG/HTML + GSAP): every diagram, chart, UI mock-up, icon and title card. Each diagram builds step by step, and every step is keyed to the narration word that names it (beat cues).\n\n`;
md += `**Sound:** ${vo.enabled ? 'narration (local TTS)' : 'no narration'} · ${sfx.length} SFX cue(s)${sfx.length ? ': ' + sfx.join(', ') : ''} · ${sb.audio?.music ? 'music: ' + sb.audio.music.src : 'no music'}.\n`;

md += `\n## Scene table\n\n| # | Time | Scene | Visual | Purpose | Narration (first words) |\n|---|---|---|---|---|---|\n`;
rows.forEach((r) => {
  md += `| ${r.i + 1} | ${fmt(r.start)} (${r.dur.toFixed(1)} s) | \`${r.s.id}\` | ${r.s.visual?.type || ''} | ${esc(r.s.purpose)} | ${esc((r.s.narration || '').split(' ').slice(0, 7).join(' '))}… |\n`;
});

md += `\n## Scene details\n`;
chapters.forEach((c) => {
  if (multi) md += `\n### ${c.num} · ${c.title}\n`;
  c.rows.forEach((r) => {
    const s = r.s;
    md += `\n#### ${r.i + 1}. \`${s.id}\`: ${fmt(r.start)}, ${r.dur.toFixed(1)} s\n\n`;
    md += `- **Purpose:** ${s.purpose || ''}\n`;
    if (s.narration) md += `- **Narration** (${words(s.narration)} words): “${s.narration}”\n`;
    if (s.on_screen_text?.length) md += `- **On screen:** ${s.on_screen_text.map((x) => `“${x}”`).join(' · ')}\n`;
    md += `- **Visual (${s.visual?.type}):** ${s.visual?.notes || ''}\n`;
    if (s.beats?.length) md += `- **Animation beats:** ${s.beats.map((b) => `\`${b.id}\` ${b.cue ? `on “${b.cue.replace(/^(text|word):/, '')}”` : `@ ${b.t}s`}`).join(' → ')}\n`;
    if (s.assets?.length) md += `- **Assets:** ${s.assets.map((a) => `\`${a}\``).join(', ')}\n`;
    md += `- **Transition in:** ${s.transition_in ? `${s.transition_in.type} ${s.transition_in.duration || 0}s` : 'none'}`;
    if (s.sfx?.length) md += ` · **SFX:** ${s.sfx.map((x) => `${x.name} on \`${x.at}\``).join(', ')}`;
    md += '\n';
  });
});

md += `\n## Production steps\n\n` + [
  `Brief and evidence bank (\`${P.rel.brief}\`): every on-screen number traced to a source.`,
  `Illustrations: \`images.mjs\` (${imgs.length} image(s)); review \`${P.rel.qa}/images-contact-sheet.png\`.`,
  'Storyboard (this plan): `validate-storyboard.mjs --plan-only`, then show this plan to the user.',
  'Voice (`voiceover.mjs`): synthesize, fit scenes to the words, cue beats, captions, mix. Then re-run `plan.mjs` for final timings.',
  'Scenes (`scenes/<id>.js`): scene kit + helpers, every time taken from `ctx.at(beat)`. For long videos, build chapters in parallel (`references/long-form.md`).',
  'QA (`qa.mjs`): look at every contact sheet against `validation.md` and `visual-playbook.md` § 8.',
  'Render (`render.mjs`) and verify (`verify-output.mjs`), then spot-check frames, then deliver.'
].map((x, i) => `${i + 1}. ${x}`).join('\n') + '\n';
fs.mkdirSync(P.docs, { recursive: true });
fs.writeFileSync(P.plan, md);

let sc = `# ${sb.meta?.title || path.basename(dir)}: narration script\n\n`;
sc += `*${totalWords} words · ${voiced ? 'final' : 'estimated'} runtime ${fmt(total)}${vo.enabled ? ` · voice ${vo.voice} @ ${vo.speed || 1}×` : ''}. Brackets describe what is on screen when the line is spoken.*\n`;
chapters.forEach((c) => {
  sc += multi ? `\n## ${c.num} · ${c.title}\n\n` : '\n';
  c.rows.forEach((r) => {
    if (!r.s.narration) return;
    const cue = (r.s.visual?.notes || '').split(/(?<=\.)\s/)[0].replace(/\.$/, '');
    sc += `**${fmt(r.start)}** · *[${cue}]*  \n${r.s.narration}\n\n`;
  });
});
fs.writeFileSync(P.script, sc);
writeReadme(dir, sb);
console.log(`✔ ${P.rel.plan} + ${P.rel.script} · ${sb.scenes.length} scenes · ${totalWords} words · ${voiced ? 'actual' : 'est.'} ${fmt(total)}`);
