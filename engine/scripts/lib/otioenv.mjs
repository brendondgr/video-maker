// Where the timeline converters live (engine/timeline/setup.sh records it):
// $OTIO_PYTHON, else ~/.config/video-maker/timeline.json (Windows: %APPDATA%\video-maker\),
// else the default ~/venvs/otio.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export function otioConfigFile() {
  const base = process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'))
    : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'));
  return path.join(base, 'video-maker', 'timeline.json');
}

export function otioEnv() {
  let conf = {};
  try { conf = JSON.parse(fs.readFileSync(otioConfigFile(), 'utf8')); } catch { /* not set up */ }
  const fallback = path.join(os.homedir(), 'venvs', 'otio', process.platform === 'win32' ? 'Scripts\\python.exe' : 'bin/python');
  const python = process.env.OTIO_PYTHON || conf.python || fallback;
  return { python, found: fs.existsSync(python), conf };
}

export const OTIO_SETUP = process.platform === 'win32'
  ? 'powershell -ExecutionPolicy Bypass -File engine\\timeline\\setup.ps1'
  : 'bash engine/timeline/setup.sh';
