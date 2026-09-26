# Installing video-maker

Three layers. Only the first is required:

| Layer | Gives you | Needs |
|---|---|---|
| **Engine** (required) | storyboard → frames → MP4, QA gates, preview | Node ≥ 18, FFmpeg, headless Chromium |
| **HyperFrames** (recommended) | `render --engine hf`, `hf.mjs` (Studio, lint/check, transcribe, …), QA gate 3b | Node ≥ 22 (it is an npm dependency of the engine) |
| **Narration** (`kokoro-tts`) | `voiceover.mjs`: local voice with word timings, retiming, captions, mix | Python 3.12 via uv, PyTorch for your GPU, Kokoro-82M |

Verify with `node engine/scripts/doctor.mjs --tts` (✖ = required and missing; ▲ = optional).

---

## 1 · Engine + HyperFrames

| OS | Commands |
|---|---|
| Fedora | `sudo dnf install nodejs22 ffmpeg` (ffmpeg from RPM Fusion; `ffmpeg-free` also works for H.264 via openh264) |
| Debian / Ubuntu | `curl -fsSL https://deb.nodesource.com/setup_22.x \| sudo bash - && sudo apt install nodejs ffmpeg` |
| Arch | `sudo pacman -S nodejs npm ffmpeg` |
| macOS | `brew install node@22 ffmpeg` |
| Windows | `winget install OpenJS.NodeJS.LTS Gyan.FFmpeg` (open a new terminal afterwards) |

Then, in the skill folder:

```bash
cd engine && npm install && npx playwright install chromium-headless-shell
node scripts/doctor.mjs
```

- **Linux distros Playwright doesn't officially support**, such as Fedora, use its Ubuntu fallback
  build, which works. If Chromium won't launch, pass `--chrome /usr/bin/chromium` or set
  `VM_CHROME`.
- **HyperFrames** manages its own Chrome (`node engine/scripts/hf.mjs . doctor`). Its optional
  extras:
  - whisper.cpp for `transcribe`, built on first use. It needs `cmake` and a C compiler.
  - Docker, for `render --engine hf --docker`, which gives byte-identical renders across machines.
  - Telemetry: our `hf.mjs` bridge turns it off (`HYPERFRAMES_NO_TELEMETRY=1`).

## 2 · Speech engines: look first, then install (`tts/setup.sh`)

Two local engines, set up by one planner:

| Engine | Command | Good for | Licence |
|---|---|---|---|
| **Kokoro-82M** (default) | `kokoro-tts` | fast, clean stock voices; fine on a CPU | Apache-2.0 |
| **Breeze TTS 2** (3B, optional) | `breeze-tts` | cloning a voice from a 10–25 s clip, designing a voice from a description, directing delivery ("whisper, nervous"), sounds like `(sigh)` `(laugh)` | weights and outputs **research / non-commercial only** |

```bash
bash tts/setup.sh --plan     # look at this machine and explain what it would do; changes nothing
bash tts/setup.sh            # the same, then ask, then install (Breeze asks you to accept its licence)
bash tts/setup.sh --engines kokoro          # only Kokoro (also: breeze, localtts)
bash tts/setup.sh --yes --accept-breeze-license   # unattended
python3 tts/probe.py --json  # the plan as JSON
```

**Claude:** run `--plan` first, tell the user what it found and what it will install (sizes,
untested combinations, the Breeze licence), and install only after they agree. Never pass
`--accept-breeze-license` unless the user accepted it.

What the planner looks at (read-only): OS and container; the GPU (vendor, model, NVIDIA compute
capability and driver CUDA version, AMD gfx target and VRAM/unified memory, Apple Silicon);
RAM, free disk, `uv`/`git`/`ffmpeg`/`espeak-ng`; what is already installed (existing
environments, weights, launchers, the registry) and whether LocalTTS is running.

How it decides for Breeze:

| Machine | Plan | Status |
|---|---|---|
| NVIDIA sm_80+ (Ampere, Ada, Hopper, Blackwell), ≥ 10 GB | PyTorch 2.9.1 `cu126/cu128/cu130` (newest the driver runs), bf16, fast stages | follows upstream; not yet run through this installer |
| NVIDIA sm_75/sm_70 (Turing, Volta), ≥ 10 GB | same, but **fp16** (no native bf16) | untested; `BREEZE_DTYPE=fp32` is the fallback |
| AMD gfx1151 (Strix Halo) | AMD `whl-next` nightly PyTorch, bf16, fast stages | **tested**: RTF ≈ 1.5, first audio ≈ 0.35 s |
| Other AMD with a ROCm build (RDNA2/3/4, MI) | TheRock nightly for the family, bf16, **eager** | untested; fast stages off because hipBLASLt could not be captured in a HIP graph on the builds tried |
| Apple Silicon, or no GPU | CPU only, very slow | installs only with `--allow-cpu-breeze`; use Kokoro instead |
| < 10 GB GPU memory, NVIDIA older than sm_70 | not supported | |

What gets installed where:
- `~/venvs/kokoro`, `~/venvs/breeze-tts`: one Python 3.12 environment per engine, torch installed
  first for the right backend (a dependency that swaps it is caught and undone).
- `~/.local/share/tts-engines/breeze-tts`: upstream Breeze at a pinned commit plus
  `tts/breeze/patches/` (the ROCm port and the `BREEZE_DTYPE` switch). Weights (7.2 GB) go
  beside it unless the planner finds existing ones; Whisper large-v3-turbo (1.6 GB) goes to the
  Hugging Face cache for word timings.
- `~/.local/bin/kokoro-tts`, `~/.local/bin/breeze-tts`: launchers (they hop to the host from a
  toolbox/distrobox container).
- `~/.config/tts-engines/engines.json`: **the registry**. What was installed, for which backend,
  dtype and fast stages. `kokoro-tts`, `breeze-tts`, video-maker and LocalTTS all read it, so an
  engine is installed once per machine. `python3 tts/registry.py show` prints it.

Each installer smoke-tests the engine before recording it, so a broken install is never
registered. Re-running continues where it stopped.

**LocalTTS (optional, separate app; the planner's third item).** An always-on API + web UI for
the same engines (github.com/brendondgr/LocalTTS), with the GPU freed after 10 idle minutes; it
can also run on a remote GPU box behind `ssh -L`. The planner finds an existing install (via
the `localtts` command, `~/Projects/LocalTTS` or `~/.local/share/tts-engines/LocalTTS`), or
clones it there and runs its installer (a systemd user service on Linux, a LaunchAgent on
macOS, a background process elsewhere). It uses the engines recorded in the registry and adds
its voices folder, so voices saved in its web UI work with `breeze-tts` too. The skill's
default `provider: "auto"` prefers it whenever it is running (see `voiceover.md`).

## 3 · Kokoro details (`kokoro-tts`)

Kokoro turns text into speech in two stages:

1. **Text to phonemes.** misaki converts the text to phonemes (G2P), falling back to
   **espeak-ng** for unknown words.
2. **Phonemes to audio.** The 82M-parameter model generates 24 kHz audio. The weights (~330 MB)
   download from Hugging Face on first use.

Kokoro is small enough to run faster than real time on a CPU. A GPU matters for long narration
and batch work.

### Kokoro on its own

`tts/setup.sh` runs this for you. To run it directly:

```bash
bash tts/install.sh                      # Linux / macOS: auto-detects the backend
```
```powershell
powershell -ExecutionPolicy Bypass -File tts\install.ps1      # Windows
```

The script:
- **Creates one environment** at `~/venvs/kokoro` (`%USERPROFILE%\venvs\kokoro` on Windows) with
  Python 3.12. Python 3.12 is the version GPU wheels target; your system Python stays untouched.
- **Installs PyTorch for the detected backend first.** Installing Kokoro first would pull the
  default PyPI torch, which is CUDA or CPU only.
- **Installs Kokoro, soundfile and the spaCy English model,** then re-checks that torch still
  matches the backend.
- **Adds the `kokoro-tts` command** to `~/.local/bin` (`kokoro-tts.cmd` on Windows) and runs
  `kokoro-tts --check`.
- **Runs on the host from containers.** Inside a toolbox or distrobox container it installs on
  the host, and the launcher re-executes on the host. That is where the GPU libraries work.

It is safe to re-run. Useful flags:
- `--gpu rocm|cuda|xpu|mps|cpu` to choose the backend yourself
- `--rocm-arch gfx1151` to set the AMD target
- `--cuda cu130` to choose the CUDA wheel flavour
- `--prefix DIR` for a different environment location
- `--force-torch` to reinstall torch

### Which backend, per machine

| Platform | GPU | Backend | torch source (what the installer uses) | Notes |
|---|---|---|---|---|
| Linux | AMD APU/iGPU: Strix Halo (Ryzen AI Max, Radeon 8060S/8050S) | `rocm` | `https://rocm.nightlies.amd.com/v2/gfx1151/` (AMD TheRock nightlies) | Tested: RTF ≈ 0.08–0.28 |
| Linux | AMD Strix Point / Krackan (Radeon 890M/880M, gfx1150/1152/1153) | `rocm` | `…/v2/gfx1150/` (or `gfx1152`, `gfx1153`) | nightly previews |
| Linux | AMD RX 7000 / Radeon 700M (gfx110x) | `rocm` | `…/v2/gfx110X-all/` | or the stable `https://download.pytorch.org/whl/rocm7.2` for officially supported cards |
| Linux | AMD RX 9000 (gfx120x) | `rocm` | `…/v2/gfx120X-all/` | |
| Linux | AMD RX 6000 (gfx103x) / Instinct MI300 (gfx94x) / MI350 (gfx950) | `rocm` | `…/v2/gfx103X-all/`, `gfx94X-dcgpu`, `gfx950-dcgpu` | |
| Linux | NVIDIA (Turing or newer) | `cuda` | `https://download.pytorch.org/whl/cu130` | needs a recent proprietary driver (`nvidia-smi` must work) |
| Linux | Intel Arc / Core Ultra iGPU | `xpu` | `https://download.pytorch.org/whl/xpu` | needs Intel GPU drivers (level-zero, compute runtime); choose it with `--gpu xpu` |
| Linux | none | `cpu` | `https://download.pytorch.org/whl/cpu` | fine for short narration |
| macOS | Apple Silicon (M1–M4) | `mps` | default PyPI wheels | the script sets `PYTORCH_ENABLE_MPS_FALLBACK=1` |
| macOS | Intel Mac | `cpu` | default PyPI wheels | recent torch no longer ships Intel-Mac wheels; if install fails, use an older torch or run on another machine |
| Windows | NVIDIA | `cuda` | `https://download.pytorch.org/whl/cu130` | |
| Windows | AMD Strix Halo / RX 7000 / RX 9000 | `rocm` | `https://rocm.nightlies.amd.com/v2/<family>/` (Windows wheels exist) | preview quality; `-Gpu cpu` is the fallback |
| Windows | none / Intel | `cpu` | `https://download.pytorch.org/whl/cpu` | WSL2 with the Linux instructions is an alternative |

AMD nightly indexes move: AMD sometimes reorganizes them, or a family stops updating for a while.
If an install loops, downloading older and older packages, or installs something very old, try
AMD's multi-arch index. Choose the GPU with an extra:
`uv pip install --pre --index-url https://nightly.repo.amd.com/rocm/whl-next/ "torch[device-gfx1151]"`.
Pass it to the installer as `--rocm-index`.

### Manual install (what the script does)

```bash
# 1 system packages (espeak-ng: the G2P fallback)
sudo dnf install espeak-ng uv          # Fedora   (apt install espeak-ng; pipx/curl for uv)
brew install espeak-ng uv              # macOS
# 2 AMD on Linux only: GPU permissions, then log out and back in
sudo usermod -aG render,video $USER
# 3 environment
uv venv ~/venvs/kokoro --python 3.12
export VIRTUAL_ENV=~/venvs/kokoro      # fish: set -gx VIRTUAL_ENV ~/venvs/kokoro
# 4 torch FIRST (pick one line from the table above)
uv pip install --pre --index-url https://rocm.nightlies.amd.com/v2/gfx1151/ torch torchaudio
~/venvs/kokoro/bin/python -c "import torch; print(torch.version.hip or torch.version.cuda, torch.cuda.is_available())"
# 5 kokoro + the spaCy model misaki would otherwise try to pip-install at runtime
uv pip install "kokoro>=0.9.4" soundfile \
  "en_core_web_sm @ https://github.com/explosion/spacy-models/releases/download/en_core_web_sm-3.8.0/en_core_web_sm-3.8.0-py3-none-any.whl"
# 6 re-run the step-4 check. If torch.version.hip is now None, kokoro replaced it:
#   rerun step 4 with --reinstall
```

On ROCm, set `MIOPEN_FIND_MODE=2`; `kokoro_tts.py` sets it for you. Without it, MIOpen
re-tunes kernels for every new input length, which costs 5–60 s per sentence. For your own
scripts, add it to your shell profile. In fish: `set -gx MIOPEN_FIND_MODE 2` in `config.fish`.

### Using it

```bash
kokoro-tts "Hello from Kokoro." -o hello.wav --timings hello.json   # WAV + word timings
kokoro-tts -f script.txt -o script.wav --voice am_michael --speed 1.05
kokoro-tts --voices                                                  # list voices
kokoro-tts --check                                                   # device + real-time factor
node engine/scripts/voiceover.mjs videos/<slug>                      # narrate a project
```

### Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `device=cpu` or `GPU available: False` on AMD | Not in the `render`/`video` groups (log out and back in after `usermod`), or a CUDA/CPU torch got installed; re-run `install.sh --force-torch` |
| Missing ROCm libraries (`libamdhip64.so`, `libatomic.so.1`) | Inside a container that lacks them: run on the host (the launcher does this in toolbox/distrobox), or install `libatomic` in the container. Pip ROCm: `export LD_LIBRARY_PATH=$(~/venvs/kokoro/bin/python -c "import rocm_sdk_core,os;print(os.path.dirname(rocm_sdk_core.__file__))")/lib:$LD_LIBRARY_PATH` |
| First run is slow | Model download + kernel compilation; the check warms up before timing |
| Words mispronounced or skipped | espeak-ng missing; install the system package |
| `kokoro-tts: command not found` | `~/.local/bin` not on PATH. fish: `fish_add_path ~/.local/bin` · bash/zsh: `export PATH="$HOME/.local/bin:$PATH"` · Windows: open a new terminal |
| misaki tries to `pip install en_core_web_sm` and fails | uv environments have no pip; install the model wheel as in step 5 |
| Nightly index installs something very old / loops | Use the multi-arch index above, or pin a known-good date |

## 4 · Breeze details (`breeze-tts`)

```bash
breeze-tts --voices                                              # saved voices
breeze-tts --add-voice Me clip.wav --ref-text "exact words in the clip"
breeze-tts "Hello." --voice Me -o hello.wav --timings hello.json # clone
breeze-tts "Hello." --voice Me --instruction "whispering, nervous" -o h.wav   # direction
breeze-tts "Hello." --instruction "a calm, deep narrator" -o h.wav           # design
breeze-tts --check                                               # device report + RTF
```

- **Voices** are folders `<name>/{reference.wav, voice.json}` (the LocalTTS layout) in
  `~/.local/share/tts-engines/voices/` plus any `voices_dirs` in the registry (LocalTTS adds
  its own), so a voice saved in either place works in both.
- **A designed voice** is generated once from the description and then cloned for every clip,
  so a whole video keeps one voice. The sample is cached per description + seed.
- **Word timings** come from Whisper, matched back to the script's own words, so captions and
  `cue`s work as with Kokoro. `(sigh)`-style tags are sounds, not words, and are left out.
- **Overrides:** `BREEZE_DTYPE=bf16|fp16|fp32`, `BREEZE_FAST=depth_decoder,backbone_decode`
  (empty = eager), `BREEZE_DEVICE=cuda|cpu`, `BREEZE_REPO`, `BREEZE_MODEL`, `BREEZE_WHISPER`.

| Symptom | Cause / fix |
|---|---|
| Hangs during "Capturing CUDA graph" (AMD) | the torch build's hipBLASLt can't be captured: `BREEZE_FAST= breeze-tts --check`; if eager works, re-run setup with `--breeze-fast ""` |
| `NaN/inf audio` | fp16 overflow on an older NVIDIA card: `BREEZE_DTYPE=fp32` (needs ~2× memory) |
| Clone sounds unlike the reference | the transcript must match the clip word for word; 10–25 s of clean speech works best |
| `no saved voice` | `breeze-tts --voices`; add it with `--add-voice`, or save it in LocalTTS |
| Out of memory | Breeze needs ~9 GiB; unload other models (e.g. `localtts unload`) |
