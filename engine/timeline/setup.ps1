# Install the timeline converters (OpenTimelineIO + adapters) used by `timeline.mjs --to`, on Windows.
#   powershell -ExecutionPolicy Bypass -File engine\timeline\setup.ps1
# Writing the .otio itself needs nothing; this is only for the other editors' formats.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$venv = if ($env:OTIO_VENV) { $env:OTIO_VENV } else { Join-Path $HOME 'venvs\otio' }
$confDir = Join-Path $env:APPDATA 'video-maker'
Write-Host "▶ timeline converters → $venv"
if (Get-Command uv -ErrorAction SilentlyContinue) {
  uv venv --allow-existing --python 3.12 $venv -q
  uv pip install --python (Join-Path $venv 'Scripts\python.exe') -q -r (Join-Path $here 'requirements.txt')
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
  py -3.12 -m venv $venv
  & (Join-Path $venv 'Scripts\python.exe') -m pip install -q -r (Join-Path $here 'requirements.txt')
} else { throw 'need uv (winget install astral-sh.uv) or the Python launcher with Python 3.12' }
New-Item -ItemType Directory -Force -Path $confDir | Out-Null
$py = Join-Path $venv 'Scripts\python.exe'
$code = @'
import json, sys, opentimelineio as otio
names = ['fcp_xml', 'fcpx_xml', 'mlt_xml', 'kdenlive', 'cmx_3600', 'AAF', 'otioz']
have = {a.name for a in otio.plugins.ActiveManifest().adapters}
conf = {'python': sys.executable, 'opentimelineio': otio.__version__, 'adapters': [n for n in names if n in have]}
json.dump(conf, open(sys.argv[1], 'w'), indent=2)
print('ok: opentimelineio ' + conf['opentimelineio'] + ' · adapters: ' + ', '.join(conf['adapters']))
'@
& $py -c $code (Join-Path $confDir 'timeline.json')
