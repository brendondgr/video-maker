// A small, dependency-free OpenTimelineIO writer: exactly the schemas the edit package uses
// (Timeline.1, Stack.1, Track.1, Clip.2, Gap.1, ExternalReference.1, Marker.2, RationalTime.1,
// TimeRange.1). The output is plain OTIO JSON, read natively by DaVinci Resolve, Premiere Pro,
// Kdenlive ≥ 25.04 and Avid, and by the `opentimelineio` Python library that converts it to
// other editors' formats (engine/timeline/convert.py).
export const RT = (value, rate) => ({ OTIO_SCHEMA: 'RationalTime.1', rate, value });
export const TR = (start, duration, rate) => ({ OTIO_SCHEMA: 'TimeRange.1', duration: RT(duration, rate), start_time: RT(start, rate) });

export const clip = ({ name, url, available, source, rate, metadata = {}, markers = [] }) => ({
  OTIO_SCHEMA: 'Clip.2', name, enabled: true, effects: [], markers, metadata,
  source_range: TR(source.start, source.frames, rate),
  media_references: {
    DEFAULT_MEDIA: {
      OTIO_SCHEMA: 'ExternalReference.1', name, metadata: {}, target_url: url,
      available_range: TR(0, available, rate), available_image_bounds: null
    }
  },
  active_media_reference_key: 'DEFAULT_MEDIA'
});

export const gap = (frames, rate) => ({ OTIO_SCHEMA: 'Gap.1', name: '', enabled: true, effects: [], markers: [], metadata: {}, source_range: TR(0, frames, rate) });

export const marker = ({ name, at, rate, color = 'GREEN', comment = '', duration = 0, metadata = {} }) => ({
  OTIO_SCHEMA: 'Marker.2', name, color, comment, metadata, marked_range: TR(at, duration, rate)
});

/**
 * A track from items placed at absolute frames: [{ at, frames, clip }]. Gaps fill the holes;
 * overlapping items are an error (one track holds one thing at a time).
 */
export function track({ name, kind, items, rate, enabled = true, metadata = {} }) {
  const children = [];
  let cursor = 0;
  for (const it of [...items].sort((a, b) => a.at - b.at)) {
    if (it.at < cursor) throw new Error(`track ${name}: ${it.clip.name} at frame ${it.at} overlaps the previous item (ends ${cursor})`);
    if (it.at > cursor) children.push(gap(it.at - cursor, rate));
    children.push(it.clip);
    cursor = it.at + it.frames;
  }
  return { OTIO_SCHEMA: 'Track.1', name, kind, enabled, effects: [], markers: [], metadata, source_range: null, children };
}

export function timeline({ name, rate, tracks, markers = [], metadata = {} }) {
  return {
    OTIO_SCHEMA: 'Timeline.1', name, metadata, global_start_time: RT(0, rate),
    tracks: { OTIO_SCHEMA: 'Stack.1', name: 'tracks', enabled: true, effects: [], markers, metadata: {}, source_range: null, children: tracks }
  };
}

/** Summary for checks and read-back comparisons: tracks, clips per track, duration, markers. */
export function summarize(tl) {
  const tracks = tl.tracks.children.map((t) => {
    let frames = 0, clips = 0;
    for (const c of t.children) { frames += c.source_range.duration.value; if (c.OTIO_SCHEMA.startsWith('Clip')) clips++; }
    return { name: t.name, kind: t.kind, clips, frames, enabled: t.enabled };
  });
  return { tracks, frames: Math.max(0, ...tracks.map((t) => t.frames)), markers: tl.tracks.markers.length };
}
