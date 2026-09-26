#!/usr/bin/env python3
"""
ComfyUI backend for the imagegen skill.

Reads a job spec (job.json), builds an API-format graph for the requested model
family, queues it on ComfyUI, waits for it, pulls the images back over HTTP, and
writes them into <job>/out/ under deterministic names.

It does NOT write manifest.json -- write_manifest.sh owns that, so that the
"job finished" signal is produced by exactly one thing in exactly one place.
This script writes <job>/.result.json, which the manifest writer consumes.

Standard library only. No PIL, no requests, no websocket.

Usage:
    comfy_backend.py <spec.json> <job_dir>

Families are matched sets (loader + encoder + type + VAE + latent + patch node).
Every value below was read from this install's live /object_info -- do not edit
them from memory. Re-verify with:
    curl -s http://127.0.0.1:8199/object_info | python3 -m json.tool
"""
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

DEFAULT_URL = os.environ.get("COMFY_URL", "http://127.0.0.1:8199")
POLL_SECONDS = 2.0
DEFAULT_TIMEOUT = int(os.environ.get("IMAGEGEN_TIMEOUT", "1800"))


# --------------------------------------------------------------------------- #
# families
#
# Each builder returns (graph, save_node_id). `graph` is API format: a flat dict
# of node_id -> {class_type, inputs}. Links are [node_id, output_index].

def _txt(graph, nid, text, clip_node):
    graph[nid] = {"class_type": "CLIPTextEncode",
                  "inputs": {"text": text, "clip": [clip_node, 0]}}


def build_z_image_turbo(p):
    """Z-Image Turbo. 8 steps, CFG 1.0. `type` is lumina2 -- not a typo:
    ComfyUI's ZImage class inherits from Lumina2. Guessing 'z_image' silently
    falls back to STABLE_DIFFUSION and fails downstream with a shape error."""
    g = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "z_image_turbo_fp8_e4m3fn.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen_3_4b.safetensors",
                         "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow",
              "inputs": {"model": ["1", 0], "shift": p["shift"]}},
        "7": {"class_type": "EmptySD3LatentImage",
              "inputs": {"width": p["width"], "height": p["height"],
                         "batch_size": p["count"]}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["4", 0], "seed": p["seed"], "steps": p["steps"],
                         "cfg": p["cfg"], "sampler_name": p["sampler"],
                         "scheduler": p["scheduler"], "positive": ["5", 0],
                         "negative": ["6", 0], "latent_image": ["7", 0],
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage",
               "inputs": {"images": ["9", 0], "filename_prefix": p["prefix"]}},
    }
    _txt(g, "5", p["prompt"], "2")
    # Turbo is guidance-distilled at CFG 1.0 -- the negative branch is inert but
    # KSampler still requires the socket to be connected.
    _txt(g, "6", p["negative"], "2")
    return g, "10"


def build_krea2_turbo(p):
    """Krea 2 Turbo. Photographic, 8-10 steps, CFG 1.0. No patch node."""
    g = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "krea2TurboFP8_krea2TURBO.safetensors",
                         "weight_dtype": "fp8_e4m3fn"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen3vl_4b_bf16.safetensors",
                         "type": "krea2", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "qwen_image_vae.safetensors"}},
        "7": {"class_type": "EmptySD3LatentImage",
              "inputs": {"width": p["width"], "height": p["height"],
                         "batch_size": p["count"]}},
        "8": {"class_type": "KSampler",
              "inputs": {"model": ["1", 0], "seed": p["seed"], "steps": p["steps"],
                         "cfg": p["cfg"], "sampler_name": p["sampler"],
                         "scheduler": p["scheduler"], "positive": ["5", 0],
                         "negative": ["6", 0], "latent_image": ["7", 0],
                         "denoise": 1.0}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage",
               "inputs": {"images": ["9", 0], "filename_prefix": p["prefix"]}},
    }
    _txt(g, "5", p["prompt"], "2")
    _txt(g, "6", p["negative"], "2")
    return g, "10"


def build_flux2_klein(p):
    """FLUX.2 Klein 9B distilled. 4 steps, CFG 1.0.

    Two things are mandatory and unique to this family:
      - EmptyFlux2LatentImage -- the DiT consumes a 128-channel latent and
        nothing else emits one.
      - Flux2Scheduler -- derives shift from width/height, so there is no
        ModelSampling* patch node and no guidance node.
    It therefore cannot use plain KSampler; it needs the custom sampler stack.
    """
    g = {
        "1": {"class_type": "UNETLoader",
              "inputs": {"unet_name": "flux-2-klein-9b-fp8.safetensors",
                         "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "qwen_3_8b_fp8mixed.safetensors",
                         "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader",
              "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "6": {"class_type": "ConditioningZeroOut",
              "inputs": {"conditioning": ["5", 0]}},
        "11": {"class_type": "CFGGuider",
               "inputs": {"model": ["1", 0], "positive": ["5", 0],
                          "negative": ["6", 0], "cfg": p["cfg"]}},
        "12": {"class_type": "RandomNoise",
               "inputs": {"noise_seed": p["seed"]}},
        "13": {"class_type": "KSamplerSelect",
               "inputs": {"sampler_name": p["sampler"]}},
        "14": {"class_type": "Flux2Scheduler",
               "inputs": {"steps": p["steps"], "width": p["width"],
                          "height": p["height"]}},
        "7": {"class_type": "EmptyFlux2LatentImage",
              "inputs": {"width": p["width"], "height": p["height"],
                         "batch_size": p["count"]}},
        "8": {"class_type": "SamplerCustomAdvanced",
              "inputs": {"noise": ["12", 0], "guider": ["11", 0],
                         "sampler": ["13", 0], "sigmas": ["14", 0],
                         "latent_image": ["7", 0]}},
        "9": {"class_type": "VAEDecode",
              "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage",
               "inputs": {"images": ["9", 0], "filename_prefix": p["prefix"]}},
    }
    _txt(g, "5", p["prompt"], "2")
    return g, "10"


FAMILIES = {
    "z-image-turbo": {
        "build": build_z_image_turbo,
        "steps": 8, "cfg": 1.0, "shift": 3.0,
        "sampler": "res_multistep", "scheduler": "simple",
        "note": "fast general-purpose default, 8 steps",
    },
    "krea2-turbo": {
        "build": build_krea2_turbo,
        "steps": 10, "cfg": 1.0, "shift": None,
        "sampler": "euler", "scheduler": "simple",
        "note": "photographic, 10 steps",
    },
    "flux2-klein": {
        "build": build_flux2_klein,
        "steps": 4, "cfg": 1.0, "shift": None,
        "sampler": "euler", "scheduler": "simple",
        "note": "best instruction-following and in-image text, 4 steps",
    },
}

SIZE_PRESETS = {
    "square": (1024, 1024),
    "portrait": (832, 1216),
    "landscape": (1216, 832),
    "wide": (1344, 768),
    "tall": (768, 1344),
}


# --------------------------------------------------------------------------- #
# transport

def _get(path, timeout=120):
    url = DEFAULT_URL.rstrip("/") + path
    with urllib.request.urlopen(url, timeout=timeout) as r:
        raw = r.read()
    return json.loads(raw.decode()) if raw else {}


def _post(path, payload, timeout=120):
    url = DEFAULT_URL.rstrip("/") + path
    req = urllib.request.Request(
        url, data=json.dumps(payload).encode(), method="POST",
        headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read()
        return json.loads(raw.decode()) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")
        try:
            detail = json.dumps(json.loads(detail), indent=2)
        except Exception:
            pass
        raise RuntimeError("ComfyUI HTTP %s on %s\n%s" % (e.code, path, detail))


def fetch_view(filename, subfolder, ftype, timeout=120):
    q = urllib.parse.urlencode(
        {"filename": filename, "subfolder": subfolder, "type": ftype})
    url = DEFAULT_URL.rstrip("/") + "/view?" + q
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return r.read()


# --------------------------------------------------------------------------- #
# helpers

def png_size(blob):
    """(width, height) from a PNG IHDR, or (None, None). Stdlib only."""
    if len(blob) >= 24 and blob[:8] == b"\x89PNG\r\n\x1a\n" and blob[12:16] == b"IHDR":
        return (int.from_bytes(blob[16:20], "big"),
                int.from_bytes(blob[20:24], "big"))
    return (None, None)


def parse_size(spec_size, family):
    """'1024x1024' | preset name -> (w, h), snapped to the family's grid."""
    if not spec_size:
        w, h = SIZE_PRESETS["square"]
    elif isinstance(spec_size, (list, tuple)) and len(spec_size) == 2:
        w, h = int(spec_size[0]), int(spec_size[1])
    elif str(spec_size).lower() in SIZE_PRESETS:
        w, h = SIZE_PRESETS[str(spec_size).lower()]
    else:
        s = str(spec_size).lower().replace("*", "x").replace("×", "x")
        if "x" not in s:
            raise SystemExit("bad size %r: want WxH or one of %s"
                             % (spec_size, ", ".join(sorted(SIZE_PRESETS))))
        a, _, b = s.partition("x")
        w, h = int(a.strip()), int(b.strip())
    # FLUX.2 pixel-unshuffles 2x2 on a /8 autoencoder, so it needs /16; the
    # 16-channel families need /8. Snap to 16 for everything -- always legal.
    grid = 16
    w2 = max(grid, int(round(w / grid)) * grid)
    h2 = max(grid, int(round(h / grid)) * grid)
    return w2, h2, (w2 != w or h2 != h)


def ext_for(filename):
    e = os.path.splitext(filename)[1]
    return e if e else ".png"


# --------------------------------------------------------------------------- #

def main():
    if len(sys.argv) < 3:
        raise SystemExit("usage: comfy_backend.py <spec.json> <job_dir>")
    spec_path, job_dir = sys.argv[1], sys.argv[2]
    spec = json.load(open(spec_path))

    out_dir = os.path.join(job_dir, "out")
    os.makedirs(out_dir, exist_ok=True)

    result = {"backend": "comfy", "images": [], "errors": [], "warnings": [],
              "params": {}}

    def bail(msg):
        result["errors"].append(msg)
        write_result(job_dir, result)
        print("ERROR: " + msg, file=sys.stderr)
        sys.exit(1)

    fam_name = (spec.get("model") or spec.get("family") or "z-image-turbo").lower()
    if fam_name not in FAMILIES:
        bail("unknown comfy family %r. Known: %s"
             % (fam_name, ", ".join(sorted(FAMILIES))))
    fam = FAMILIES[fam_name]

    prompt_text = (spec.get("prompt") or "").strip()
    if not prompt_text:
        bail("spec has no prompt")

    try:
        width, height, snapped = parse_size(spec.get("size"), fam_name)
    except SystemExit as e:
        bail(str(e))
    if snapped:
        result["warnings"].append(
            "size snapped to %dx%d (must be a multiple of 16)" % (width, height))

    seed = spec.get("seed")
    if seed is None:
        seed = random.randint(0, 2 ** 63 - 1)
    seed = int(seed)

    count = int(spec.get("count") or 1)
    stem = spec.get("filename") or "image"
    stem = os.path.splitext(os.path.basename(stem))[0]

    params = {
        "prompt": prompt_text,
        "negative": spec.get("negative") or "",
        "width": width, "height": height,
        "count": count,
        "seed": seed,
        "steps": int(spec.get("steps") or fam["steps"]),
        "cfg": float(spec.get("cfg") if spec.get("cfg") is not None else fam["cfg"]),
        "shift": float(spec.get("shift") if spec.get("shift") is not None
                       else (fam["shift"] or 0.0)),
        "sampler": spec.get("sampler") or fam["sampler"],
        "scheduler": spec.get("scheduler") or fam["scheduler"],
        "prefix": "imagegen/" + os.path.basename(job_dir.rstrip("/")),
    }
    result["params"] = dict(params, family=fam_name, comfy_url=DEFAULT_URL)

    # Fail fast and legibly if the server is not up, rather than mid-poll.
    try:
        _get("/system_stats", timeout=10)
    except Exception as e:
        bail("ComfyUI not reachable at %s (%s). Start it with `comfyui start`."
             % (DEFAULT_URL, e))

    graph, save_node = fam["build"](params)
    with open(os.path.join(job_dir, "graph.api.json"), "w") as f:
        json.dump(graph, f, indent=2)

    print("family=%s %dx%d steps=%d cfg=%s seed=%d count=%d"
          % (fam_name, width, height, params["steps"], params["cfg"], seed, count))

    try:
        resp = _post("/prompt", {"prompt": graph, "client_id": "imagegen-skill"})
    except Exception as e:
        bail(str(e))

    prompt_id = resp.get("prompt_id")
    if not prompt_id:
        bail("no prompt_id in /prompt response: %r" % (resp,))
    # A prompt with several output branches succeeds if ANY branch validates;
    # the rest are reported here and silently skipped. Never ignore this.
    if resp.get("node_errors"):
        result["warnings"].append("node_errors on queue: %s"
                                  % json.dumps(resp["node_errors"]))
    print("queued prompt_id=%s number=%s" % (prompt_id, resp.get("number")))

    deadline = time.time() + DEFAULT_TIMEOUT
    entry = None
    while time.time() < deadline:
        time.sleep(POLL_SECONDS)
        try:
            hist = _get("/history/%s" % prompt_id, timeout=30)
        except Exception as e:
            result["warnings"].append("history poll hiccup: %s" % e)
            continue
        # /history/{id} returns {} with status 200 while running -- not a 404.
        if hist.get(prompt_id):
            entry = hist[prompt_id]
            break
    if entry is None:
        bail("timed out after %ds waiting for prompt %s" % (DEFAULT_TIMEOUT, prompt_id))

    status = entry.get("status") or {}
    if status.get("status_str") == "error":
        msgs = []
        for m in status.get("messages") or []:
            if m and m[0] == "execution_error":
                d = m[1] or {}
                msgs.append("%s in node %s (%s): %s"
                            % (d.get("exception_type"), d.get("node_id"),
                               d.get("node_type"), d.get("exception_message")))
        bail("execution failed: " + ("; ".join(msgs) or json.dumps(status)))

    images = []
    for node_id, out in (entry.get("outputs") or {}).items():
        for img in (out.get("images") or []):
            if img.get("type") == "temp":
                continue
            images.append(img)
    if not images:
        bail("run reported success but produced no images "
             "(outputs=%s)" % json.dumps(entry.get("outputs") or {}))

    multi = len(images) > 1
    for i, img in enumerate(images, 1):
        try:
            blob = fetch_view(img["filename"], img.get("subfolder", ""),
                              img.get("type", "output"))
        except Exception as e:
            result["errors"].append("could not fetch %s: %s" % (img["filename"], e))
            continue
        name = ("%s-%02d%s" % (stem, i, ext_for(img["filename"])) if multi
                else "%s%s" % (stem, ext_for(img["filename"])))
        dest = os.path.join(out_dir, name)
        with open(dest, "wb") as f:
            f.write(blob)
        w, h = png_size(blob)
        images_entry = {
            "path": os.path.join("out", name),
            "prompt": prompt_text,
            "w": w, "h": h,
            "bytes": len(blob),
            "seed": seed + (i - 1) if multi else seed,
            "comfy_filename": img["filename"],
        }
        result["images"].append(images_entry)
        print("saved %s (%sx%s, %d bytes)" % (dest, w, h, len(blob)))

    if not result["images"]:
        bail("no images could be retrieved")

    write_result(job_dir, result)
    return 0


def write_result(job_dir, result):
    with open(os.path.join(job_dir, ".result.json"), "w") as f:
        json.dump(result, f, indent=2)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except Exception as exc:  # last resort -- still leave a machine-readable trace
        jd = sys.argv[2] if len(sys.argv) > 2 else "."
        try:
            write_result(jd, {"backend": "comfy", "images": [],
                              "errors": ["unhandled: %r" % (exc,)]})
        except Exception:
            pass
        raise
