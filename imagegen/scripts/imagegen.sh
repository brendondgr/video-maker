#!/usr/bin/env bash
# imagegen.sh -- dispatch one image-generation job to a backend.
#
#   imagegen.sh <spec.json> [--detach] [--force]
#
# Prints the job directory on stdout and nothing else, so callers can capture it.
# All backend chatter goes to <job>/log/backend.log.
#
# The completion contract is <job>/manifest.json: it is written LAST, and moved
# into place atomically. Its presence means the job is over (successfully or
# not). Its absence means still running, or the process was killed. Never infer
# completion from anything else.
#
# --detach returns immediately and orphans the work into its own session; use it
# only from an interactive shell. Claude Code should run this WITHOUT --detach
# under the Bash tool's run_in_background, so that the tool's own
# "command completed" notification lines up with the job actually finishing.
set -euo pipefail

SELF="$(readlink -f "${BASH_SOURCE[0]}")"
SCRIPTS="$(dirname "$SELF")"
ROOT="${IMAGEGEN_ROOT:-$HOME/imagegen}"

die() { echo "imagegen: $*" >&2; exit 1; }

command -v jq >/dev/null || die "jq is required"

SPEC=""
DETACH=0
FORCE=0
INTERNAL_RUN=0
for arg in "$@"; do
  case "$arg" in
    --detach)       DETACH=1 ;;
    --force)        FORCE=1 ;;
    --internal-run) INTERNAL_RUN=1 ;;
    -h|--help)      sed -n '2,20p' "$SELF"; exit 0 ;;
    -*)             die "unknown flag $arg" ;;
    *)              SPEC="$arg" ;;
  esac
done

[[ -n "$SPEC" ]] || die "usage: imagegen.sh <spec.json> [--detach] [--force]"
[[ -f "$SPEC" ]] || die "spec not found: $SPEC"
SPEC="$(readlink -f "$SPEC")"
jq -e . "$SPEC" >/dev/null 2>&1 || die "spec is not valid JSON: $SPEC"

JOB_ID="$(jq -r '.job_id // empty' "$SPEC")"
[[ -n "$JOB_ID" ]] || die "spec has no job_id"
case "$JOB_ID" in
  */*|.*) die "job_id must be a bare slug, got: $JOB_ID" ;;
esac

BACKEND="$(jq -r '.backend // "comfy"' "$SPEC")"
ADAPTER="$SCRIPTS/backends/$BACKEND.sh"
[[ -x "$ADAPTER" ]] || die "no executable backend adapter for '$BACKEND' ($ADAPTER)"

JOB="$ROOT/jobs/$JOB_ID"

# Reusing a job_id silently mixes runs: images from the previous run stay in
# out/, so a run that generated nothing still reports images and looks partly
# successful. Refuse, unless --force is given (which clears out/ first).
if [[ -d "$JOB/out" ]] && [[ -n "$(ls -A "$JOB/out" 2>/dev/null)" ]]; then
  if [[ $FORCE -eq 1 ]]; then
    rm -rf "${JOB:?}/out"
  else
    die "job '$JOB_ID' already has output in $JOB/out.
       Pick a new job_id, or pass --force to discard the previous run."
  fi
fi

mkdir -p "$JOB/out" "$JOB/log"

# Keep the spec with the job, so a job directory is self-describing forever.
[[ "$(readlink -f "$SPEC")" == "$JOB/job.json" ]] || cp "$SPEC" "$JOB/job.json"

# A stale manifest from a previous run of the same job_id would read as "done"
# the instant a watcher looked. Clear the completion markers up front.
rm -f "$JOB/manifest.json" "$JOB/.result.json" "$JOB/.started"
date -u +%Y-%m-%dT%H:%M:%SZ > "$JOB/.started"

run_job() {
  local rc=0
  "$ADAPTER" "$JOB/job.json" "$JOB" >"$JOB/log/backend.log" 2>&1 || rc=$?
  # write_manifest always runs, including after a backend crash or a bad exit
  # code -- a failed job must still produce a manifest saying so.
  "$SCRIPTS/write_manifest.sh" "$JOB/job.json" "$JOB" "$rc" || true
  if command -v notify-send >/dev/null 2>&1; then
    local st; st="$(jq -r '.status // "unknown"' "$JOB/manifest.json" 2>/dev/null || echo unknown)"
    notify-send "imagegen: $JOB_ID" "$st" >/dev/null 2>&1 || true
  fi
  return 0
}

if [[ $INTERNAL_RUN -eq 1 ]]; then
  run_job
  exit 0
fi

if [[ $DETACH -eq 1 ]]; then
  setsid nohup "$SELF" "$JOB/job.json" --internal-run >/dev/null 2>&1 &
  disown 2>/dev/null || true
  echo "$JOB"
  exit 0
fi

run_job
echo "$JOB"
