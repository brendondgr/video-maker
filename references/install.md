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

## 2 · Narration: `kokoro-tts`

Kokoro turns text into speech in two stages:

1. **Text to phonemes.** misaki converts the text to phonemes (G2P), falling back to
   **espeak-ng** for unknown words.
2. **Phonemes to audio.** The 82M-parameter model generates 24 kHz audio. The weights (~330 MB)
   download from Hugging Face on first use.

Kokoro is small enough to run faster than real time on a CPU. A GPU matters for long narration
and batch work.

### One-command install (recommended)

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
