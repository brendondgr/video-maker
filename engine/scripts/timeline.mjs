#!/usr/bin/env node
// Write the edit package's timeline, edit/<slug>.otio (OpenTimelineIO), from the clip plan and
// the audio stems:
//
//   V1 Scenes       edit/video/<scene>.mov      one per scene, with handles
//   V2 Transitions  edit/video/<a>__<b>.mov     over each overlap
//   V3 Captions     edit/overlay/captions.mov   alpha layer (or import edit/captions/captions.srt)
//   A1 Voice        edit/audio/voice/<scene>.wav, aligned with the V1 clips
//   A2 Music        edit/audio/music.wav
//   A3 SFX          edit/audio/sfx/*.wav        (A3b, A3c… when cues overlap)
//   A4 Mix          edit/audio/mix.wav          disabled: the mastered reference
//   markers         green at every scene start, blue at every beat (named by beat, cue in the comment)
//
//   node timeline.mjs <project> [--absolute] [--to <editor>[,<editor>…]] [--list]
//
// Media paths are relative to edit/ (the .otio travels with its folder); --absolute writes
// file:// URLs instead. --to converts the timeline for other editors (see --list).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, projectDir, readJSON, writeJSON, fmtTime } from './lib/common.mjs';
import { projectPaths, slugOf } from './lib/paths.mjs';
import { clipPlan, editSettings } from './lib/segments.mjs';
import { clip, track, marker, timeline, summarize } from './lib/otio.mjs';
import { writeReadme } from './lib/readme.mjs';

export function buildTimeline(dir, sb, { absolute = false } = {}) {
  const P = projectPaths(dir, sb);
  if (P.layout < 2) throw new Error('the edit package needs project layout 2 — run migrate-layout.mjs first');
  const e = editSettings(sb);
  const fps = +(sb.canvas?.fps || 30);
  const plan = clipPlan(sb, dir, { fps, handles: e.handles, codec: e.codec });
  const url = (f) => (absolute ? pathToFileURL(f).href : path.relative(P.edit, f).split(path.sep).join('/'));
  const missing = [];
  const media = (f) => { if (!fs.existsSync(f)) missing.push(path.relative(dir, f)); return url(f); };
  const meta = (x) => ({ 'video-maker': x });

  const v1 = plan.scenes.map((s) => ({ at: s.timeline.start, frames: s.source.frames, clip: clip({ name: s.id, url: media(s.file), available: s.media.frames, source: s.source, rate: fps, metadata: meta({ scene_id: s.id, handles_frames: plan.handles }) }) }));
  const v2 = plan.transitions.map((t) => ({ at: t.timeline.start, frames: t.source.frames, clip: clip({ name: `${t.from}__${t.to}`, url: media(t.file), available: t.media.frames, source: t.source, rate: fps, metadata: meta({ transition: sb.scenes[t.index].transition_in?.type, from: t.from, to: t.to }) }) }));
  const v3 = plan.overlay ? [{ at: 0, frames: plan.total, clip: clip({ name: 'captions', url: media(plan.overlay.file), available: plan.total, source: { start: 0, frames: plan.total }, rate: fps, metadata: meta({ overlays: plan.overlay.names }) }) }] : [];

  let stems = null;
  try { stems = JSON.parse(fs.readFileSync(path.join(P.editAudio, 'stems.json'), 'utf8')); } catch { /* no voice-over yet */ }
  const F = (t) => Math.round(t * fps), Ffloor = (t) => Math.floor(t * fps + 1e-6);
  const audioItem = (s, name, extra = {}) => {
    const frames = Math.max(1, Ffloor(s.duration));
    return { at: F(s.at), frames, clip: clip({ name, url: media(path.join(P.edit, s.file)), available: frames, source: { start: 0, frames }, rate: fps, metadata: meta(extra) }) };
  };
  // Clip names are unique across tracks: some formats (MLT) use them as ids.
  const a1 = (stems?.voice || []).map((v) => audioItem(v, `${v.id}-voice`, { scene_id: v.id }));
  const a2 = stems?.music ? [audioItem(stems.music, 'music')] : [];
  // SFX that overlap go to extra lanes (one track holds one clip at a time).
  const lanes = [];
  for (const s of [...(stems?.sfx || [])].sort((a, b) => a.at - b.at)) {
    const it = audioItem(s, `sfx-${path.basename(s.file, '.wav')}`, { scene_id: s.scene, sfx: s.name });
    let lane = lanes.find((l) => l.end <= it.at);
    if (!lane) { lane = { items: [], end: 0 }; lanes.push(lane); }
    lane.items.push(it); lane.end = it.at + it.frames;
  }
  const a4 = fs.existsSync(P.mix) ? [audioItem({ file: path.relative(P.edit, P.mix), at: 0, duration: plan.total / fps }, 'mix-reference')] : [];

  const tracks = [
    track({ name: 'V1 Scenes', kind: 'Video', items: v1, rate: fps }),
    track({ name: 'V2 Transitions', kind: 'Video', items: v2, rate: fps }),
    ...(v3.length ? [track({ name: 'V3 Captions', kind: 'Video', items: v3, rate: fps })] : []),
    ...(a1.length ? [track({ name: 'A1 Voice', kind: 'Audio', items: a1, rate: fps })] : []),
    ...(a2.length ? [track({ name: 'A2 Music', kind: 'Audio', items: a2, rate: fps })] : []),
    ...lanes.map((l, k) => track({ name: `A3${k ? String.fromCharCode(97 + k) : ''} SFX`, kind: 'Audio', items: l.items, rate: fps })),
    ...(a4.length ? [track({ name: 'A4 Mix (reference)', kind: 'Audio', items: a4, rate: fps, enabled: false })] : [])
  ];

  const markers = [];
  for (const s of plan.scenes) {
    const spec = sb.scenes[s.index];
    markers.push(marker({ name: s.id, at: s.timeline.start, rate: fps, color: 'GREEN', comment: spec.purpose || '', metadata: meta({ scene_id: s.id }) }));
    for (const b of spec.beats || []) {
      if (!b.id || b.t == null) continue;
      markers.push(marker({ name: b.id, at: s.timeline.start + F(+b.t), rate: fps, color: 'BLUE', comment: b.cue ? String(b.cue).replace(/^(text|word):/, '') : '', metadata: meta({ scene_id: s.id, beat: b.id }) }));
    }
  }
  markers.sort((a, b) => a.marked_range.start_time.value - b.marked_range.start_time.value);

  const slug = slugOf(sb, dir);
  const tl = timeline({ name: sb.meta?.title || slug, rate: fps, tracks, markers,
    metadata: meta({ project: slug, fps, width: sb.canvas?.width, height: sb.canvas?.height, handles_frames: plan.handles, codec: e.codec, layout: P.layout }) });
  return { tl, file: path.join(P.edit, `${slug}.otio`), missing, plan, fps };
}

const args = parseArgs();
const dir = projectDir(args);
const sb = await readJSON(path.join(dir, 'storyboard.json'));
if (!args.list) {
  const { tl, file, missing, fps } = buildTimeline(dir, sb, { absolute: !!args.absolute });
  await writeJSON(file, tl);
  const sum = summarize(tl);
  console.log(`✔ ${path.relative(process.cwd(), file)} · ${fmtTime(sum.frames / fps)} at ${fps} fps · ${sum.markers} markers`);
  for (const t of sum.tracks) console.log(`  ${t.name.padEnd(20)} ${String(t.clips).padStart(3)} clip(s)${t.enabled ? '' : '  (disabled)'}`);
  if (missing.length) console.log(`  ▲ ${missing.length} media file(s) not rendered yet (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}): run render.mjs --edit${missing.some((m) => /audio/.test(m)) ? ' and voiceover.mjs' : ''}`);
  writeReadme(dir, sb);
}
if (args.to || args.list) {
  const { convertTimeline, listTargets } = await import('./lib/convert.mjs');
  if (args.list) listTargets();
  else await convertTimeline(dir, sb, String(args.to).split(','), { absolute: !!args.absolute });
}
