#!/usr/bin/env node
/**
 * Readability audit.
 *
 * The app renders text over a changing sky, so contrast has to be checked
 * against the composite colour — the glass surface blended over whatever sky is
 * behind it — not against the surface alone. This script does that for every
 * ink/surface pair against every sky colour the app can paint, and fails if
 * anything drops below its WCAG AA target.
 *
 *   node scripts/audit-contrast.mjs
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const css = readFileSync(path.join(ROOT, 'src/index.css'), 'utf8');

/** Reads `--name: r g b;` and `--name: #hex;` custom properties per selector. */
function readTokens(selector) {
  const block = new RegExp(`${selector}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!block) throw new Error(`No CSS block found for ${selector}`);
  const tokens = {};
  for (const line of block[1].split('\n')) {
    const match = /--([\w-]+):\s*([^;]+);/.exec(line);
    if (match) tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

function toRgb(value) {
  if (value.startsWith('#')) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  const parts = value.split(/[\s,]+/).map(Number).filter((n) => !Number.isNaN(n));
  if (parts.length >= 3) return parts.slice(0, 3);
  throw new Error(`Cannot read colour: ${value}`);
}

const channel = (c) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);

function contrast(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

/** Blends `fg` over `bg` at the given alpha. */
const over = (fg, bg, alpha) => fg.map((c, i) => c * alpha + bg[i] * (1 - alpha));

const base = readTokens(':root');
const scenes = ['sunrise', 'day', 'golden', 'night'].map((name) => ({
  name,
  tokens: { ...base, ...readTokens(`\\[data-scene='${name}'\\]`) },
}));

/** Every colour a sky can be behind a panel, worst cases included. */
function skyColours(tokens) {
  return ['sky-top', 'sky-mid', 'sky-low', 'sky-horizon'].map((key) => toRgb(tokens[key]));
}

const checks = [];

for (const scene of scenes) {
  const { tokens } = scene;
  const darkSurface = toRgb(tokens['glass-dark']);
  const lightSurface = toRgb(tokens['glass-light']);
  const darkAlpha = Number(tokens['glass-dark-alpha']);
  const strongAlpha = Number(tokens['glass-dark-strong-alpha']);
  const lightAlpha = Number(tokens['glass-light-alpha']);
  const pillAlpha = 0.92; // .glass-pill

  for (const sky of skyColours(tokens)) {
    const surfaces = [
      ['.glass', over(darkSurface, sky, darkAlpha), 'dark'],
      ['.glass-strong', over(darkSurface, sky, strongAlpha), 'dark'],
      ['.glass-pill', over(darkSurface, sky, pillAlpha), 'dark'],
      ['.glass-light', over(lightSurface, sky, lightAlpha), 'light'],
    ];

    for (const [surfaceName, surface, kind] of surfaces) {
      const inks =
        kind === 'dark'
          ? [
              ['body text', toRgb(tokens['ink-on-dark']), 4.5],
              ['muted text', toRgb(tokens['ink-on-dark-muted']), 4.5],
              ['gold accent', toRgb(tokens.gold), 4.5],
            ]
          : [
              ['scripture text', toRgb(tokens['ink-on-light']), 4.5],
              ['muted text', toRgb(tokens['ink-on-light-muted']), 4.5],
              ['reference link', toRgb(tokens['gold-deep']), 4.5],
            ];

      for (const [inkName, ink, target] of inks) {
        checks.push({
          scene: scene.name,
          surface: surfaceName,
          ink: inkName,
          ratio: contrast(ink, surface),
          target,
        });
      }
    }
  }
}

// Buttons paint their own opaque background, so they are checked directly.
const gold = toRgb(base.gold);
checks.push({
  scene: 'any',
  surface: '.btn-primary',
  ink: 'button label',
  ratio: contrast(toRgb('#241701'), gold),
  target: 4.5,
});

const failures = checks.filter((c) => c.ratio < c.target);
const worst = new Map();
for (const check of checks) {
  const key = `${check.surface} · ${check.ink}`;
  if (!worst.has(key) || worst.get(key).ratio > check.ratio) worst.set(key, check);
}

console.log('Contrast audit — worst case for each surface and ink pairing\n');
for (const [key, check] of [...worst.entries()].sort((a, b) => a[1].ratio - b[1].ratio)) {
  const status = check.ratio >= check.target ? 'PASS' : 'FAIL';
  console.log(
    `  ${status}  ${check.ratio.toFixed(2)}:1  (target ${check.target}:1)  ${key}  [worst on ${check.scene}]`,
  );
}

console.log(`\n${checks.length} combinations checked, ${failures.length} below target.`);
if (failures.length > 0) process.exit(1);
