// timeline.mjs --to <editor>: convert edit/<slug>.otio for editors that don't read OTIO, through
// engine/timeline/convert.py (opentimelineio + adapters, installed by engine/timeline/setup.sh).
// Every conversion is read back and compared with the .otio; what the format dropped is printed.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ENGINE_DIR } from './common.mjs';
import { projectPaths, slugOf } from './paths.mjs';
import { otioEnv, OTIO_SETUP } from './otioenv.mjs';

// editor name → { adapter, ext, absolute paths?, what it opens, caveat }
const NATIVE = { adapter: null, ext: '.otio', note: 'opens the .otio directly (File → Import → Timeline)' };
export const TARGETS = {
  resolve:           { ...NATIVE, editor: 'DaVinci Resolve 18+' },
  premiere:          { ...NATIVE, editor: 'Premiere Pro (recent; older: premiere-legacy)', note: 'File → Import the .otio' },
  kdenlive:          { ...NATIVE, editor: 'Kdenlive 25.04+' },
  avid:              { ...NATIVE, editor: 'Avid Media Composer (OTIO import)' },
  blender:           { ...NATIVE, editor: 'Blender VSE (OTIO add-on)' },
  bundle:            { adapter: 'otioz', ext: '.otioz', editor: 'any OTIO editor, on another machine', note: 'one file with the timeline and all media (relative paths inside)' },
  finalcut:          { adapter: 'fcpx_xml', ext: '.fcpxml', absolute: true, editor: 'Final Cut Pro', note: 'V2/V3 become connected clips; markers are not carried' },
  shotcut:           { adapter: 'mlt_xml', ext: '.mlt', editor: 'Shotcut (MLT XML)', note: 'markers are not carried; the muted reference mix is left out' },
  openshot:          { adapter: 'fcp_xml', ext: '.xml', absolute: true, editor: 'OpenShot (File → Import → Final Cut Pro XML)' },
  lightworks:        { adapter: 'fcp_xml', ext: '.xml', absolute: true, editor: 'Lightworks (Import → XML)' },
  'premiere-legacy': { adapter: 'fcp_xml', ext: '.xml', absolute: true, editor: 'Premiere Pro, any version (Import → Final Cut Pro XML)' },
  fcp7:              { adapter: 'fcp_xml', ext: '.xml', absolute: true, editor: 'anything that reads Final Cut Pro 7 XML' },
  'kdenlive-legacy': { adapter: 'kdenlive', ext: '.kdenlive', absolute: true, editor: 'Kdenlive before 25.04', note: 'deprecated adapter; prefer the .otio in 25.04+' },
  'avid-aaf':        { adapter: 'AAF', ext: '.aaf', absolute: true, editor: 'Avid Media Composer, Pro Tools (AAF)', note: 'markers are not carried; relink media by name' },
  edl:               { adapter: 'cmx_3600', ext: '.edl', v1Only: true, editor: 'any editor (CMX 3600 EDL)', note: 'last resort: the V1 cut list only, no audio, captions or transitions' }
};

export function listTargets() {
  console.log('timeline.mjs <project> --to <editor>[,<editor>…]\n');
  for (const [k, t] of Object.entries(TARGETS)) {
    console.log(`  ${k.padEnd(16)} ${t.ext.padEnd(9)} ${t.editor}${t.note ? `\n  ${''.padEnd(26)} ${t.note}` : ''}${t.absolute ? `\n  ${''.padEnd(26)} media paths are absolute: re-run on another machine` : ''}`);
  }
}

export async function convertTimeline(dir, sb, names, { absolute = false } = {}) {
  const P = projectPaths(dir, sb);
  const slug = slugOf(sb, dir);
  const otio = path.join(P.edit, `${slug}.otio`);
  if (!fs.existsSync(otio)) throw new Error(`${path.relative(process.cwd(), otio)} missing — run timeline.mjs first`);
  const unknown = names.filter((n) => !TARGETS[n]);
  if (unknown.length) throw new Error(`unknown editor(s) ${unknown.join(', ')}; see timeline.mjs --list`);
  const env = otioEnv();
  const done = new Map();   // one file per adapter even when several editors share it
  let failed = 0;
  for (const name of names) {
    const t = TARGETS[name];
    if (!t.adapter) { console.log(`✔ ${name}: ${t.editor} ${t.note} → ${path.relative(process.cwd(), otio)}`); continue; }
    const out = path.join(P.edit, `${slug}${t.ext}`);
    if (done.has(t.adapter)) { console.log(`✔ ${name}: ${t.editor} → ${path.relative(process.cwd(), out)} (same file as ${done.get(t.adapter)})`); continue; }
    if (!env.found) throw new Error(`the timeline converters are not installed — run: ${OTIO_SETUP}`);
    const argv = [path.join(ENGINE_DIR, 'timeline', 'convert.py'), otio, t.adapter, out];
    if (t.absolute || absolute) argv.push('--absolute');
    if (t.v1Only) argv.push('--v1-only');
    const r = spawnSync(env.python, argv, { encoding: 'utf8' });
    const line = (r.stdout || '').trim().split('\n').reverse().find((l) => l.startsWith('{'));
    let res = null;
    try { res = JSON.parse(line); } catch { /* reported below */ }
    if (!res?.ok) { failed++; console.log(`✖ ${name}: conversion failed — ${res?.error || (r.stderr || r.stdout || '').trim().split('\n').slice(-3).join(' ')}`); continue; }
    done.set(t.adapter, name);
    console.log(`✔ ${name}: ${t.editor} → ${path.relative(process.cwd(), out)}`);
    for (const l of lossReport(res.source, res.readback)) console.log(`    ▲ ${l}`);
    for (const n of res.notes) console.log(`    · ${n}`);
    if (t.note) console.log(`    · ${t.note}`);
    if (t.absolute || absolute) console.log('    · written for this machine (absolute media paths): re-run on another one, or relink in the editor');
  }
  if (failed) process.exitCode = 1;
}

// Compare the .otio's summary with what the converted file holds.
function lossReport(src, back) {
  if (!back) return ['could not read the file back to check it'];
  const out = [];
  const cmp = (k, label) => { if (back[k] != null && back[k] !== src[k]) out.push(`${label}: ${src[k]} → ${back[k]}`); };
  cmp('video_tracks', 'video tracks'); cmp('audio_tracks', 'audio tracks'); cmp('clips', 'clips'); cmp('markers', 'markers');
  if (back.frames != null && Math.abs(back.frames - src.frames) > 1) out.push(`length: ${src.frames} → ${back.frames} frames`);
  if (back.tracks != null && back.video_tracks == null) out.push(`holds ${back.tracks} track(s), ${back.clips} clip(s) (of ${src.video_tracks + src.audio_tracks} / ${src.clips})`);
  return out;
}
