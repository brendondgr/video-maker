#!/usr/bin/env bash
# comfy backend adapter: <spec.json> <job_dir>
# Local ComfyUI over HTTP. Free, deterministic (seeds), no auth, no second agent.
set -euo pipefail
SCRIPTS="$(dirname "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")")"
exec python3 "$SCRIPTS/comfy_backend.py" "$1" "$2"
