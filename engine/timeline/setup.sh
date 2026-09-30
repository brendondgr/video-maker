#!/usr/bin/env bash
# Install the timeline converters (OpenTimelineIO + adapters) used by `timeline.mjs --to`.
#   bash engine/timeline/setup.sh            # create/refresh the environment
#   OTIO_VENV=/path bash engine/timeline/setup.sh   # somewhere other than ~/venvs/otio
# Writing the .otio itself needs nothing; this is only for Final Cut, Shotcut, OpenShot,
# Lightworks, Avid (AAF), EDL and legacy Premiere/Kdenlive files. Windows: setup.ps1.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV="${OTIO_VENV:-$HOME/venvs/otio}"
CONF_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/video-maker"

# Inside a toolbox/distrobox container, install on the host (where node/ffmpeg run).
if [ -z "${OTIO_NO_HOST:-}" ] && { [ -e /run/.toolboxenv ] || [ -e /run/.containerenv ]; }; then
  if command -v flatpak-spawn >/dev/null 2>&1; then exec flatpak-spawn --host --directory="$PWD" bash "$HERE/setup.sh" "$@"; fi
  if command -v distrobox-host-exec >/dev/null 2>&1; then exec distrobox-host-exec bash "$HERE/setup.sh" "$@"; fi
fi

# OpenTimelineIO ships compiled wheels for CPython 3.8–3.13: uv fetches 3.12 if needed.
echo "▶ timeline converters → $VENV"
if command -v uv >/dev/null 2>&1; then
  uv venv --allow-existing --python 3.12 "$VENV" -q
  UV_LINK_MODE=copy uv pip install --python "$VENV/bin/python" -q -r "$HERE/requirements.txt"
else
  PY=""
  for c in python3.13 python3.12 python3.11 python3.10 python3; do
    if command -v "$c" >/dev/null 2>&1 && "$c" -c 'import sys; sys.exit(not ((3, 8) <= sys.version_info[:2] <= (3, 13)))'; then PY="$c"; break; fi
  done
  [ -n "$PY" ] || { echo "✖ need Python 3.8–3.13, or uv (curl -LsSf https://astral.sh/uv/install.sh | sh)" >&2; exit 1; }
  "$PY" -m venv "$VENV"
  "$VENV/bin/python" -m pip install -q --upgrade pip
  "$VENV/bin/python" -m pip install -q -r "$HERE/requirements.txt"
fi

mkdir -p "$CONF_DIR"
"$VENV/bin/python" - "$CONF_DIR/timeline.json" <<'PY'
import json, sys, opentimelineio as otio
from importlib.metadata import version
names = ['fcp_xml', 'fcpx_xml', 'mlt_xml', 'kdenlive', 'cmx_3600', 'AAF', 'otioz']
have = {a.name for a in otio.plugins.ActiveManifest().adapters}
conf = {'python': sys.executable, 'opentimelineio': otio.__version__,
        'packages': {p: version(p) for p in ['OpenTimelineIO-Plugins', 'otio-fcpx-xml-adapter', 'otio-mlt-adapter', 'otio-kdenlive-adapter']},
        'adapters': [n for n in names if n in have]}
json.dump(conf, open(sys.argv[1], 'w'), indent=2)
print(f"✔ opentimelineio {conf['opentimelineio']} · adapters: {', '.join(conf['adapters'])}")
print(f"  recorded in {sys.argv[1]}")
PY
