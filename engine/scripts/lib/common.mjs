// Shared plumbing for the video-maker CLI: arg parsing, static server, browser launch.
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export const ENGINE_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const SKILL_DIR = path.resolve(ENGINE_DIR, '..');

// ------------------------------------------------------------------ args
/** Tiny argv parser: positional args plus --key value / --key=value / --flag. */
export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) { out[a.slice(2, eq)] = a.slice(eq + 1); continue; }
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) { out[key] = next; i++; }
      else out[key] = true;
    } else out._.push(a);
  }
  return out;
}

export function projectDir(args) {
  const dir = path.resolve(args._[0] || args.project || '.');
  if (!fs.existsSync(path.join(dir, 'storyboard.json'))) {
    throw new Error(`no storyboard.json in ${dir} — pass the project directory as the first argument`);
  }
  return dir;
}

export async function readJSON(p) { return JSON.parse(await fsp.readFile(p, 'utf8')); }
export async function writeJSON(p, v) { await fsp.mkdir(path.dirname(p), { recursive: true }); await fsp.writeFile(p, JSON.stringify(v, null, 2) + '\n'); }

// ---------------------------------------------------------------- server
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8',
  '.geojson': 'application/json', '.topojson': 'application/json', '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json'
};

/** Serve the project at / and the engine at /_engine/. Resolves { url, close }. */
export function serve(project, { port = 0, host = '127.0.0.1', log = false } = {}) {
  const server = http.createServer(async (req, res) => {
    try {
      const u = new URL(req.url, 'http://x');
      let rel = decodeURIComponent(u.pathname);
      let root = project;
      if (rel.startsWith('/_engine/')) { root = ENGINE_DIR; rel = rel.slice('/_engine'.length); }
      if (rel.endsWith('/')) rel += 'index.html';
      const file = path.resolve(root, '.' + rel);
      if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
      const st = await fsp.stat(file).catch(() => null);
      if (!st || !st.isFile()) { if (log) console.log('404', rel); res.writeHead(404).end('not found'); return; }
      res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      fs.createReadStream(file).pipe(res);
    } catch (e) { res.writeHead(500).end(String(e)); }
  });
  return new Promise((resolve) => server.listen(port, host, () => {
    const { port: p } = server.address();
    resolve({ url: `http://${host}:${p}`, port: p, close: () => new Promise((r) => server.close(r)) });
  }));
}

// --------------------------------------------------------------- browser
export async function launchBrowser(args = {}) {
  let pw;
  try { pw = await import('playwright'); }
  catch { throw new Error('playwright is not installed — run `npm install` inside the engine directory'); }
  const executablePath = args.chrome || process.env.VM_CHROME || process.env.CHROME_PATH || undefined;
  const launchArgs = [
    '--hide-scrollbars', '--mute-audio', '--force-color-profile=srgb', '--font-render-hinting=none',
    '--disable-lcd-text', '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
    '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'
  ];
  try {
    return await pw.chromium.launch({ headless: true, executablePath, args: launchArgs });
  } catch (e) {
    throw new Error(`could not launch Chromium (${e.message.split('\n')[0]}).\n` +
      `Fix: run \`npx playwright install chromium\` in the engine directory, or pass --chrome /path/to/chrome (or set VM_CHROME).`);
  }
}

/** Open the composition in render mode and wait for window.__vm.ready. */
export async function openComposition(browser, baseUrl, { width, height, scale = 1, timeout = 60000, render = true, query = '' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const logs = { console: [], pageErrors: [], failedRequests: [], external: [] };
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) logs.console.push({ type: m.type(), text: m.text() }); });
  page.on('pageerror', (e) => logs.pageErrors.push(String(e && e.message || e)));
  page.on('requestfailed', (r) => logs.failedRequests.push(`${r.url()} (${r.failure()?.errorText})`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(baseUrl) && !u.startsWith('data:') && !u.startsWith('blob:')) logs.external.push(u); });
  page.on('response', (r) => { if (r.status() >= 400) logs.failedRequests.push(`${r.url()} (HTTP ${r.status()})`); });
  await page.goto(`${baseUrl}/index.html?${render ? 'render=1' : ''}${query ? '&' + query : ''}`, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__vm && (window.__vm.ready || window.__vm.failed), null, { timeout });
  const info = await page.evaluate(() => {
    const v = window.__vm;
    return { ready: !!v.ready, failed: !!v.failed, duration: v.duration, fps: v.fps, width: v.width, height: v.height,
      frames: v.frames, scenes: v.scenes, warnings: v.warnings || [], errors: v.errors || [], registered: v.registered || [] };
  });
  return { context, page, info, logs };
}

export async function seek(page, t) { return page.evaluate((x) => window.__vm.seek(x), t); }

// ---------------------------------------------------------------- ffmpeg
export function which(cmd) {
  return new Promise((resolve) => {
    const p = spawn(process.platform === 'win32' ? 'where' : 'which', [cmd]);
    let out = ''; p.stdout.on('data', (d) => (out += d));
    p.on('close', (c) => resolve(c === 0 ? out.trim().split('\n')[0] : null));
    p.on('error', () => resolve(null));
  });
}

export function run(cmd, argv, { input, quiet = true } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, argv, { stdio: [input ? 'pipe' : 'ignore', 'pipe', 'pipe'] });
    let out = '', err = '';
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => { err += d; if (!quiet) process.stderr.write(d); });
    p.on('error', reject);
    p.on('close', (code) => code === 0 ? resolve({ out, err }) : reject(new Error(`${cmd} exited ${code}\n${err.slice(-2000)}`)));
    if (input) { p.stdin.end(input); }
  });
}

export function fmtTime(s) { const m = Math.floor(s / 60); return `${m}:${(s - m * 60).toFixed(2).padStart(5, '0')}`; }

/** Pretty-print a findings report: [{level:'error'|'warn'|'info', code, msg, scene?, t?}] */
export function printFindings(title, findings) {
  const icon = { error: '✖', warn: '▲', info: '·' };
  const counts = { error: 0, warn: 0, info: 0 };
  console.log(`\n${title}`);
  for (const f of findings) {
    counts[f.level]++;
    const where = [f.scene && `[${f.scene}]`, f.t != null && `@${(+f.t).toFixed(2)}s`].filter(Boolean).join(' ');
    console.log(`  ${icon[f.level]} ${f.level.toUpperCase().padEnd(5)} ${f.code.padEnd(22)} ${where ? where + ' ' : ''}${f.msg}`);
  }
  console.log(`  → ${counts.error} error(s), ${counts.warn} warning(s)`);
  return counts;
}

/** True when the calling module was executed directly (robust to spaces/symlinks in paths). */
export function isMain(metaUrl) {
  try { return fs.realpathSync(fileURLToPath(metaUrl)) === fs.realpathSync(path.resolve(process.argv[1])); }
  catch { return false; }
}

/**
 * Pixel diff of two PNG/JPEG buffers, done in a scratch page (no native deps).
 * Returns { fraction, maxDelta, bbox } where fraction = share of pixels whose max
 * channel delta exceeds `threshold`.
 */
export async function diffImages(browser, a, b, { threshold = 8 } = {}) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(async ({ a, b, threshold }) => {
      const load = (src) => new Promise((r, j) => { const i = new Image(); i.onload = () => r(i); i.onerror = j; i.src = src; });
      const [ia, ib] = await Promise.all([load(a), load(b)]);
      const w = ia.width, h = ia.height;
      if (w !== ib.width || h !== ib.height) return { fraction: 1, maxDelta: 255, bbox: null };
      const c = new OffscreenCanvas(w, h), g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(ia, 0, 0); const da = g.getImageData(0, 0, w, h).data;
      g.clearRect(0, 0, w, h); g.drawImage(ib, 0, 0); const db = g.getImageData(0, 0, w, h).data;
      let n = 0, max = 0, x0 = w, y0 = h, x1 = -1, y1 = -1;
      for (let i = 0; i < da.length; i += 4) {
        const d = Math.max(Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]));
        if (d > max) max = d;
        if (d > threshold) { n++; const p = i / 4, x = p % w, y = (p / w) | 0; if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
      }
      return { fraction: n / (w * h), maxDelta: max, bbox: x1 >= 0 ? [x0, y0, x1 - x0 + 1, y1 - y0 + 1] : null };
    }, { a: 'data:image/png;base64,' + a.toString('base64'), b: 'data:image/png;base64,' + b.toString('base64'), threshold });
  } finally { await page.close(); }
}
