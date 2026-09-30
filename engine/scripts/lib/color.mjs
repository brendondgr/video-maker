// Colour helpers for looks: parsing, WCAG contrast, mixing, and deriving the neutral tokens of a
// palette from the few colours a look is really about (background + accents).

export const TOKENS = ['bg', 'surface', 'ink', 'muted', 'line', 'accent', 'accent-2', 'accent-3', 'warn'];

export function parseHex(s) {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(s || '').trim());
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
export const toHex = (rgb) => '#' + rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');

export function luminance(hex) {
  const rgb = parseHex(hex);
  if (!rgb) return null;
  const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a, b) {
  const la = luminance(a), lb = luminance(b);
  if (la == null || lb == null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}
export const isDark = (hex) => (luminance(hex) ?? 0) < 0.18;
export const mix = (a, b, t) => { const A = parseHex(a), B = parseHex(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };

function rgbToHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb([h, s, l]) {
  h = ((h % 360) + 360) % 360 / 360;
  if (!s) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}
// How colourful a colour reads: HSL saturation, discounted near black and white.
export function chroma(hex) { const rgb = parseHex(hex); if (!rgb) return 0; const [, sat, l] = rgbToHsl(rgb); return sat * (1 - Math.abs(2 * l - 1)); }
const rotate = (hex, deg) => { const [h, s, l] = rgbToHsl(parseHex(hex)); return toHex(hslToRgb([h + deg, s, l])); };
// Step lightness away from the background until the colour reaches `min` contrast on it.
function legible(hex, bg, min) {
  let [h, s, l] = rgbToHsl(parseHex(hex)), out = hex;
  const step = isDark(bg) ? 0.03 : -0.03;
  for (let i = 0; i < 30 && contrast(out, bg) < min && l > 0 && l < 1; i++) { l += step; out = toHex(hslToRgb([h, s, l])); }
  return out;
}

// Fill the tokens a look left out. Ink leans toward the background's hue, neutrals are mixes of
// bg and ink, missing accents are hue rotations of the main accent. Returns { palette, derived }.
export function completePalette(given) {
  const p = { ...given }, derived = [];
  const set = (k, v) => { if (!p[k]) { p[k] = v; derived.push(k); } };
  const dark = isDark(p.bg);
  set('ink', mix(p.bg, dark ? '#ffffff' : '#000000', 0.92));
  set('surface', mix(p.bg, p.ink, dark ? 0.07 : 0.04));
  set('line', mix(p.bg, p.ink, 0.2));
  set('muted', legible(mix(p.bg, p.ink, 0.62), p.bg, 4.6));
  set('accent-2', legible(rotate(p.accent, 150), p.bg, 3.2));
  set('accent-3', legible(rotate(p.accent, -100), p.bg, 3.2));
  set('warn', dark ? '#f2665c' : '#c8342b');
  return { palette: Object.fromEntries(TOKENS.map((k) => [k, p[k]])), derived };
}

// Legibility checks against the background. Returns [{ token, ratio, min, ok }].
export function contrastReport(p) {
  const need = { ink: 7, muted: 4.5, accent: 3, 'accent-2': 3, 'accent-3': 3, warn: 3 };
  return Object.entries(need).filter(([k]) => p[k] && p.bg).map(([k, min]) => {
    const ratio = contrast(p[k], p.bg);
    return { token: k, ratio, min, ok: ratio != null && ratio >= min };
  });
}
