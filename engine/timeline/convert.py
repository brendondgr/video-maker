#!/usr/bin/env python3
"""Convert an edit-package timeline (.otio) to another editor's format, then read the result
back and report what the format kept and what it lost. Run by `timeline.mjs --to` with the
interpreter from engine/timeline/setup.sh.

    convert.py <in.otio> <adapter> <out> [--absolute] [--v1-only]

  --absolute   rewrite relative media paths to absolute file:// URLs first (FCP7 XML, FCPXML,
               AAF and Kdenlive files need them)
  --v1-only    keep only the V1 scene track (+ nothing else): EDL holds one video track

Prints one JSON object: {"ok", "adapter", "out", "source": summary, "readback": summary|null,
"notes": [...]}. A summary is {"video_tracks", "audio_tracks", "clips", "frames", "markers"}.
"""
import copy
import json
import os
import sys
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET

import opentimelineio as otio


def summary(tl):
    tracks = list(tl.tracks)
    frames = max((t.duration().to_frames() for t in tracks), default=0) if tracks else 0
    return {
        "video_tracks": sum(1 for t in tracks if t.kind == otio.schema.TrackKind.Video),
        "audio_tracks": sum(1 for t in tracks if t.kind == otio.schema.TrackKind.Audio),
        "clips": sum(len(list(t.find_clips())) for t in tracks),
        "frames": int(round(frames)),
        "markers": len(tl.tracks.markers) + sum(len(t.markers) for t in tracks)
        + sum(len(c.markers) for t in tracks for c in t.find_clips()),
    }


def mlt_summary(path):
    """otio's MLT adapter is write-only: count what the XML holds."""
    root = ET.parse(path).getroot()
    playlists = [p for p in root.iter("playlist") if p.get("id") not in ("main_bin", "background")]
    entries = sum(len(p.findall("entry")) for p in playlists)
    fps = None
    prof = root.find("profile")
    if prof is not None and prof.get("frame_rate_num"):
        fps = int(prof.get("frame_rate_num")) / int(prof.get("frame_rate_den", "1"))
    return {"video_tracks": None, "audio_tracks": None, "tracks": len(playlists), "clips": entries,
            "frames": None, "markers": None, "fps": fps}


def mlt_fix(path, tl):
    """otio's MLT writer leaves out what Shotcut/Kdenlive/melt need to show the tracks together:
    the canvas profile, a blend transition per upper video track (so V2/V3 composite with alpha
    over V1) and a mix transition per audio track. Add them the way Shotcut writes its own."""
    meta = tl.metadata.get("video-maker", {})
    tree = ET.parse(path)
    root = tree.getroot()
    prof = root.find("profile")
    w, h = int(meta.get("width") or 1920), int(meta.get("height") or 1080)
    fps = int(meta.get("fps") or 30)
    from math import gcd
    g = gcd(w, h)
    for k, v in {"width": w, "height": h, "progressive": 1, "sample_aspect_num": 1, "sample_aspect_den": 1,
                 "display_aspect_num": w // g, "display_aspect_den": h // g, "frame_rate_num": fps,
                 "frame_rate_den": 1, "colorspace": 709}.items():
        prof.set(k, str(v))
    prof.attrib.pop("decsription", None)
    prof.set("description", f"{w}x{h} {fps}fps")
    kinds = {t.name: t.kind for t in tl.tracks}
    tractor = root.find("tractor")
    tracks = tractor.find("multitrack").findall("track")
    def prop(el, name, value):
        p = ET.SubElement(el, "property", name=name)
        p.text = str(value)
    for i, tr in enumerate(tracks):
        kind = kinds.get(tr.get("producer"))
        if i == 0 or kind is None:
            continue
        tr.set("hide", "video" if kind == otio.schema.TrackKind.Audio else "audio")
        t = ET.SubElement(tractor, "transition")
        prop(t, "a_track", 0)
        prop(t, "b_track", i)
        if kind == otio.schema.TrackKind.Audio:
            prop(t, "mlt_service", "mix"); prop(t, "always_active", 1); prop(t, "sum", 1)
        else:
            prop(t, "mlt_service", "qtblend"); prop(t, "always_active", 1)
    ET.indent(tree)
    tree.write(path, xml_declaration=True, encoding="utf-8")


def absolutize(tl, base):
    for clip in tl.find_clips():
        ref = clip.media_reference
        if isinstance(ref, otio.schema.ExternalReference) and ref.target_url and "://" not in ref.target_url:
            p = os.path.abspath(os.path.join(base, urllib.parse.unquote(ref.target_url)))
            ref.target_url = urllib.parse.urljoin("file:", urllib.request.pathname2url(p))


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    src, adapter, out = args
    notes = []
    tl = otio.adapters.read_from_file(src)
    source = summary(tl)
    work = copy.deepcopy(tl)
    if "--absolute" in flags or adapter == "otioz":
        absolutize(work, os.path.dirname(os.path.abspath(src)))
    if "--v1-only" in flags:
        keep = [t for t in work.tracks if t.kind == otio.schema.TrackKind.Video][:1]
        for t in list(work.tracks):
            if t not in keep:
                work.tracks.remove(t)
        notes.append("EDL holds one video track: only V1 (scenes) was written")
    # Disabled tracks (A4, the reference mix) are dropped by formats that can't mark them muted.
    if adapter in ("cmx_3600", "mlt_xml"):
        for t in list(work.tracks):
            if not t.enabled:
                work.tracks.remove(t)
                notes.append(f"dropped disabled track {t.name!r}")
    kw = {}
    rate = next((c.source_range.duration.rate for c in tl.find_clips()), 30)
    if adapter == "AAF":
        kw["use_empty_mob_ids"] = True   # our media carries no Avid mob ids; Avid relinks by name
    if adapter == "otioz":
        kw["media_policy"] = otio.adapters.file_bundle_utils.MediaReferencePolicy.ErrorIfNotFile
    otio.adapters.write_to_file(work, out, adapter_name=adapter, **kw)
    if adapter == "mlt_xml":
        mlt_fix(out, work)
        notes.append("added the canvas profile and blend/mix transitions so tracks layer as in the .otio")

    readback = None
    try:
        if adapter == "mlt_xml":
            readback = mlt_summary(out)
        else:
            rk = {"rate": rate} if adapter == "cmx_3600" else {}
            readback = summary(otio.adapters.read_from_file(out, adapter_name=adapter, **rk))
    except Exception as e:  # noqa: BLE001 - report, don't fail the conversion
        notes.append(f"could not read the result back: {type(e).__name__}: {e}")
    print(json.dumps({"ok": True, "adapter": adapter, "out": out, "source": source, "readback": readback, "notes": notes}))


if __name__ == "__main__":
    try:
        main()
    except Exception as e:  # noqa: BLE001
        print(json.dumps({"ok": False, "error": f"{type(e).__name__}: {e}"}))
        sys.exit(1)
