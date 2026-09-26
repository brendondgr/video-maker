#!/usr/bin/env bash
# codex backend adapter: <spec.json> <job_dir>
#
# Codex is used as a PAYMENT SHIM, not as an intelligence layer. Its built-in
# `image_gen` tool rides the existing Codex subscription auth, so no
# OPENAI_API_KEY is needed -- that, and only that, is the reason to route an
# image through a coding agent at all.
#
# It is therefore handed a fully-formed prompt, a fixed output path, and nothing
# to decide. Confinement:
#   --cd "$JOB"        working root is the job directory, never a real repo
#   -s workspace-write writes are limited to that directory
# Do not add --dangerously-bypass-approvals-and-sandbox here.
set -euo pipefail

SPEC="$1"
JOB="$2"

command -v jq >/dev/null || { echo "jq is required" >&2; exit 2; }
command -v codex >/dev/null || { echo "codex CLI not found on PATH" >&2; exit 2; }

PROMPT="$(jq -r '.prompt // empty' "$SPEC")"
[[ -n "$PROMPT" ]] || { echo "spec has no prompt" >&2; exit 2; }

SIZE="$(jq -r '.size // "1024x1024"' "$SPEC")"
COUNT="$(jq -r '.count // 1' "$SPEC")"
STEM="$(jq -r '.filename // "image"' "$SPEC")"
STEM="${STEM%.*}"

# Codex's imagegen skill only accepts a few sizes; map our presets onto them.
case "$SIZE" in
  square)             SIZE="1024x1024" ;;
  portrait|tall)      SIZE="1024x1536" ;;
  landscape|wide)     SIZE="1536x1024" ;;
esac

if [[ "$COUNT" -gt 1 ]]; then
  NAMING="Save them as out/${STEM}-01.png, out/${STEM}-02.png, and so on."
else
  NAMING="Save it as out/${STEM}.png."
fi

# Optional reference images: copied into the job dir (so the job stays self-contained) and
# attached to the Codex turn with -i, in spec order.
IMAGE_ARGS=()
REFS=""
mkdir -p "$JOB/ref"
n=0
while IFS= read -r ref; do
  [[ -n "$ref" ]] || continue
  [[ -f "$ref" ]] || { echo "reference image not found: $ref" >&2; exit 2; }
  n=$((n + 1))
  dest="$JOB/ref/$(printf '%02d' "$n")-$(basename "$ref")"
  cp "$ref" "$dest"
  IMAGE_ARGS+=(-i "$dest")
  REFS+="Reference image ${n}: $(basename "$ref")
"
done < <(jq -r '.reference_images // [] | .[]' "$SPEC")
# Codex's image_gen tool rejects more than 5 (`referenced_image_paths` must contain at most 5).
[[ "$n" -le 5 ]] || { echo "codex image_gen accepts at most 5 reference images, got $n (combine some into one sheet)" >&2; exit 2; }
if [[ "$n" -gt 0 ]]; then
  REFS="The ${n} attached images are reference images, in this order:
${REFS}Pass them to the image_gen tool as reference/input images and follow the prompt's
instructions about how to use each one.
"
fi

INSTRUCTION="Use the \$imagegen skill's built-in image_gen tool to generate ${COUNT} image(s).
${REFS}
Prompt, to be used verbatim and not reinterpreted:
${PROMPT}

Size: ${SIZE}.
${NAMING}
Paths are relative to your working directory, which already contains an out/ directory.
After the image_gen tool returns, copy the generated file(s) from the default
\$CODEX_HOME/generated_images location to those exact paths.

Constraints: do not create, edit or delete any other file. Do not write code.
Do not run a dev server. Do not explain your work or produce a summary."

echo "codex backend: size=$SIZE count=$COUNT stem=$STEM refs=$n"

rc=0
# stdin MUST be /dev/null. `codex exec` treats a non-TTY stdin as piped input and
# blocks forever waiting for EOF ("Reading additional input from stdin..."), which
# under a background runner is an invisible hang rather than an error.
codex exec \
  --cd "$JOB" \
  -s workspace-write \
  --skip-git-repo-check \
  "${IMAGE_ARGS[@]}" \
  -- "$INSTRUCTION" </dev/null || rc=$?

# The agent is not trusted to report accurately; the files on disk decide.
# Emit .result.json from what actually landed in out/.
python3 - "$JOB" "$PROMPT" "$rc" <<'PY'
import json, os, sys
job, prompt, rc = sys.argv[1], sys.argv[2], int(sys.argv[3])
out = os.path.join(job, "out")
images, errors = [], []

def png_size(b):
    if len(b) >= 24 and b[:8] == b"\x89PNG\r\n\x1a\n" and b[12:16] == b"IHDR":
        return int.from_bytes(b[16:20], "big"), int.from_bytes(b[20:24], "big")
    return None, None

names = sorted(f for f in os.listdir(out)) if os.path.isdir(out) else []
for fn in names:
    if fn.startswith("."):
        continue
    full = os.path.join(out, fn)
    if not os.path.isfile(full):
        continue
    with open(full, "rb") as f:
        head = f.read(32)
    w, h = png_size(head)
    images.append({"path": os.path.join("out", fn), "prompt": prompt,
                   "w": w, "h": h, "bytes": os.path.getsize(full)})

if rc != 0:
    errors.append("codex exec exited with code %d" % rc)
if not images:
    errors.append("codex produced no files in out/ -- check log/backend.log for "
                  "an auth prompt, a refusal, or a tool error")

with open(os.path.join(job, ".result.json"), "w") as f:
    json.dump({"backend": "codex", "images": images, "errors": errors,
               "warnings": [], "params": {"size": os.environ.get("IMAGEGEN_SIZE", "")}},
              f, indent=2)
PY

exit "$rc"
