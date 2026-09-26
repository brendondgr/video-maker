#!/usr/bin/env bash
# write_manifest.sh <spec.json> <job_dir> [backend_exit_code]
#
# Writes <job_dir>/manifest.json atomically (temp file + mv, same filesystem).
# This is the ONLY thing that creates manifest.json, and it is the last thing
# that runs in a job. A reader that sees manifest.json sees a complete file.
#
# Sources, in order of trust:
#   1. <job_dir>/.result.json  -- what the backend reported (authoritative)
#   2. the files actually in <job_dir>/out/  -- ground truth for what exists
#   3. the exit code            -- the fallback when the backend said nothing
set -euo pipefail

SPEC="${1:?usage: write_manifest.sh <spec.json> <job_dir> [rc]}"
JOB="${2:?usage: write_manifest.sh <spec.json> <job_dir> [rc]}"
RC="${3:-0}"

TMP="$JOB/.manifest.json.$$"

python3 - "$SPEC" "$JOB" "$RC" "$TMP" <<'PY'
import json, os, sys, time

spec_path, job, rc, tmp = sys.argv[1], sys.argv[2], int(sys.argv[3]), sys.argv[4]

def load(p, default):
    try:
        with open(p) as f:
            return json.load(f)
    except Exception:
        return default

def read_text(p, default=""):
    try:
        with open(p) as f:
            return f.read().strip()
    except Exception:
        return default

spec = load(spec_path, {})
res = load(os.path.join(job, ".result.json"), None)

started = read_text(os.path.join(job, ".started")) or None
finished = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())

images = list((res or {}).get("images") or [])
errors = list((res or {}).get("errors") or [])
warnings = list((res or {}).get("warnings") or [])

if res is None:
    errors.append(
        "backend exited (code %d) without writing .result.json -- it crashed "
        "before reporting. See log/backend.log." % rc)

# Ground truth: what is actually on disk. A backend that lied about a path, or
# wrote files it never reported, is caught here.
out_dir = os.path.join(job, "out")
on_disk = set()
if os.path.isdir(out_dir):
    for root, _dirs, files in os.walk(out_dir):
        for fn in files:
            if fn.startswith("."):
                continue
            full = os.path.join(root, fn)
            on_disk.add(os.path.relpath(full, job))

claimed = set()
kept = []
for img in images:
    rel = img.get("path")
    full = os.path.join(job, rel) if rel else None
    if not rel or not os.path.isfile(full):
        errors.append("backend reported %r but no such file exists" % (rel,))
        continue
    claimed.add(rel)
    img.setdefault("bytes", os.path.getsize(full))
    img["abs_path"] = os.path.abspath(full)
    kept.append(img)

for rel in sorted(on_disk - claimed):
    full = os.path.join(job, rel)
    kept.append({"path": rel, "abs_path": os.path.abspath(full),
                 "bytes": os.path.getsize(full), "unreported": True})
    warnings.append("found unreported file %s in out/" % rel)

if kept and not errors:
    status = "ok"
elif kept:
    status = "partial"
else:
    status = "error"
    if rc != 0 and not errors:
        errors.append("backend exited with code %d and produced no images" % rc)

log = os.path.join(job, "log", "backend.log")
tail = ""
if status != "ok" and os.path.isfile(log):
    try:
        with open(log, errors="replace") as f:
            tail = "".join(f.readlines()[-25:]).strip()
    except Exception:
        pass

manifest = {
    "job_id": spec.get("job_id") or os.path.basename(job.rstrip("/")),
    "backend": (res or {}).get("backend") or spec.get("backend") or "unknown",
    "status": status,
    "started": started,
    "finished": finished,
    "exit_code": rc,
    "job_dir": os.path.abspath(job),
    "spec": spec,
    "params": (res or {}).get("params") or {},
    "images": kept,
    "warnings": warnings,
    "errors": errors,
}
if tail:
    manifest["log_tail"] = tail

with open(tmp, "w") as f:
    json.dump(manifest, f, indent=2)
    f.write("\n")
    f.flush()
    os.fsync(f.fileno())
PY

# Atomic within the same filesystem: a reader sees either no manifest or a
# complete one, never a half-written one.
mv -f "$TMP" "$JOB/manifest.json"
