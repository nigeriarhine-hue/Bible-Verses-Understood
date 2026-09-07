#!/usr/bin/env node
/**
 * Global readability audit.
 *
 * The background of this app is a changing sky, so the rule is absolute: no
 * readable text may sit directly on it. Every piece of text must have an
 * ancestor painting a substantial surface — a glass panel, a pill, a button.
 *
 * This walks every rendered page and reports any text that fails, along with
 * anything below the product's minimum type sizes.
 *
 *   node scripts/audit-readability.mjs [baseUrl]
 *
 * Requires the app to be running (npm run preview) and Playwright installed.
 */
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://127.0.0.1:4173';
const CHROME = process.env.CHROMIUM_PATH ?? undefined;

const ROUTES = [
  ['home', '/'],
  ['study', '/verse/romans/8/28'],
  ['chapter', '/bible/psalms/23'],
  ['bible', '/bible'],
  ['topics', '/topics'],
  ['topic', '/topics/anxiety'],
  ['daily', '/daily'],
  ['guidance', '/guidance'],
  ['saved', '/saved'],
  ['history', '/history'],
  ['profile', '/profile'],
  ['sign-in', '/sign-in'],
  ['about', '/about'],
  ['not-found', '/nowhere'],
];

const VIEWPORTS = [
  [320, 720, '320'],
  [375, 812, '375'],
  [390, 844, '390'],
  [430, 932, '430'],
  [768, 900, '768'],
  [1280, 900, '1280'],
];

/**
 * States a reader can put the interface into that are not visible on load —
 * menus, dropdowns and dialogs still have to pass the same rules.
 */
const INTERACTIONS = [
  {
    name: 'mobile-menu',
    path: '/',
    maxWidth: 1023,
    async run(page) {
      await page.click('button[aria-controls="mobile-menu"]');
    },
  },
  {
    name: 'translation-menu',
    path: '/',
    minWidth: 640,
    async run(page) {
      await page.click('button[aria-haspopup="listbox"]');
    },
  },
  {
    name: 'save-prompt',
    path: '/verse/john/3/16',
    async run(page) {
      await page.waitForTimeout(900);
      await page.click('button:has-text("Save")');
    },
  },
  {
    name: 'share-dialog',
    path: '/verse/john/3/16',
    async run(page) {
      await page.waitForTimeout(900);
      await page.click('button:has-text("Share")');
    },
  },
];

/** Runs inside the page: finds text with no surface behind it, and small type. */
function audit() {
  const problems = [];
  const MIN_SIZE = 13.5; // 14px, allowing for sub-pixel rounding

  const alphaOf = (color) => {
    const match = /rgba?\(([^)]+)\)/.exec(color);
    if (!match) return color === 'transparent' ? 0 : 1;
    const parts = match[1].split(',').map((p) => parseFloat(p));
    return parts.length > 3 ? parts[3] : 1;
  };

  const describe = (el) => {
    const cls = String(el.className || '').slice(0, 60);
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48);
    return `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}> “${text}”`;
  };

  for (const el of document.querySelectorAll('body *')) {
    // Only elements that render their own text.
    const ownText = [...el.childNodes]
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent.trim())
      .join('')
      .trim();
    if (!ownText) continue;

    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    // Screen-reader-only text is not seen, so it needs no surface.
    if (el.closest('.sr-only') || el.classList.contains('sr-only')) continue;

    const size = parseFloat(style.fontSize);
    if (size < MIN_SIZE) {
      problems.push({ kind: 'small-type', detail: `${size}px`, element: describe(el) });
    }

    // Walk up looking for a surface with meaningful opacity.
    let node = el;
    let covered = 0;
    while (node && node !== document.body) {
      const nodeStyle = getComputedStyle(node);
      // A gradient (buttons use one) is an opaque surface just as much as a
      // solid colour is.
      if (nodeStyle.backgroundImage && nodeStyle.backgroundImage !== 'none') {
        covered = 1;
        break;
      }
      const alpha = alphaOf(nodeStyle.backgroundColor);
      if (alpha > 0) covered = 1 - (1 - covered) * (1 - alpha);
      if (covered >= 0.6) break;
      node = node.parentElement;
    }
    if (covered < 0.6) {
      problems.push({
        kind: 'text-on-sky',
        detail: `surface opacity ${covered.toFixed(2)}`,
        element: describe(el),
      });
    }
  }
  return problems;
}

const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
const findings = [];

for (const [w, h, tag] of VIEWPORTS) {
  const context = await browser.newContext({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  // Fonts and analytics are irrelevant to layout and slow every load down.
  await page.route(/googletagmanager|google-analytics|fonts\.(googleapis|gstatic)|www\.google\.com/, (route) =>
    route.abort(),
  );

  for (const [name, path] of ROUTES) {
    try {
      await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 20000 });
    } catch {
      findings.push({ route: name, viewport: tag, kind: 'load-failed', detail: path, element: '' });
      continue;
    }
    await page.waitForTimeout(900);

    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
    });
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      findings.push({
        route: name,
        viewport: tag,
        kind: 'horizontal-overflow',
        detail: `${overflow.scrollWidth}px in ${overflow.clientWidth}px`,
        element: '',
      });
    }

    for (const problem of await page.evaluate(audit)) {
      findings.push({ route: name, viewport: tag, ...problem });
    }
  }

  for (const interaction of INTERACTIONS) {
    if (interaction.maxWidth && w > interaction.maxWidth) continue;
    if (interaction.minWidth && w < interaction.minWidth) continue;
    try {
      await page.goto(BASE + interaction.path, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await page.waitForTimeout(900);
      await interaction.run(page);
      await page.waitForTimeout(500);
    } catch (error) {
      findings.push({
        route: interaction.name,
        viewport: tag,
        kind: 'interaction-failed',
        detail: String(error).split('\n')[0].slice(0, 120),
        element: '',
      });
      continue;
    }

    const overflow = await page.evaluate(() => {
      const d = document.documentElement;
      return { scrollWidth: d.scrollWidth, clientWidth: d.clientWidth };
    });
    if (overflow.scrollWidth > overflow.clientWidth + 1) {
      findings.push({
        route: interaction.name,
        viewport: tag,
        kind: 'horizontal-overflow',
        detail: `${overflow.scrollWidth}px in ${overflow.clientWidth}px`,
        element: '',
      });
    }
    for (const problem of await page.evaluate(audit)) {
      findings.push({ route: interaction.name, viewport: tag, ...problem });
    }
  }

  await context.close();
}
await browser.close();

// Group so the same component is not reported once per viewport.
const grouped = new Map();
for (const finding of findings) {
  const key = `${finding.kind}|${finding.element}|${finding.detail}`;
  if (!grouped.has(key)) grouped.set(key, { ...finding, routes: new Set(), viewports: new Set() });
  grouped.get(key).routes.add(finding.route);
  grouped.get(key).viewports.add(finding.viewport);
}

if (grouped.size === 0) {
  console.log(
    `Readability audit: ${ROUTES.length} routes + ${INTERACTIONS.length} interaction states, ` +
      `across ${VIEWPORTS.length} viewports (${VIEWPORTS.map((v) => v[2]).join(', ')}px) — no problems found.`,
  );
  process.exit(0);
}

console.log(`Readability audit found ${grouped.size} problems:\n`);
for (const problem of grouped.values()) {
  console.log(`  [${problem.kind}] ${problem.detail}`);
  console.log(`    ${problem.element}`);
  console.log(`    routes: ${[...problem.routes].join(', ')}  ·  widths: ${[...problem.viewports].join(', ')}\n`);
}
process.exit(1);
