#!/usr/bin/env node
/**
 * Prefetch next/font/google CSS + woff2 for Harbor images.
 *
 * Writes /opt/bench/mocked-google-fonts.cjs for NEXT_FONT_GOOGLE_MOCKED_RESPONSES.
 * CSS url(...) entries are rewritten to absolute `/…/file.woff2` paths so
 * next/font's mock mode reads them from disk (no fonts.gstatic.com at verify time).
 *
 * Usage:
 *   node prefetch-google-fonts.mjs --out /opt/bench --app /app/apps/www
 *   # or explicit: --font 'Inter:{"subsets":["latin-ext"]}' --font 'Oxygen:{"subsets":["latin-ext"],"weight":["700"]}'
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/104.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const arg = (k, d) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : d;
};
const outDir = path.resolve(arg('out', '/opt/bench'));
const appDir = path.resolve(arg('app', process.cwd()));
const fonts = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--font') fonts.push(args[++i]);
}

const fontDir = path.join(outDir, 'google-fonts');
fs.mkdirSync(fontDir, { recursive: true });

function findNextGoogleDir(from) {
  const pkgJson = path.join(from, 'package.json');
  if (!fs.existsSync(pkgJson)) return null;
  const require = createRequire(pkgJson);
  try {
    const nextEntry = require.resolve('next/package.json');
    const base = path.dirname(nextEntry);
    const candidate = path.join(base, 'dist/compiled/@next/font/dist/google');
    if (fs.existsSync(path.join(candidate, 'get-google-fonts-url.js'))) return candidate;
  } catch {
    /* ignore */
  }
  // pnpm nested walk
  const root = path.join(from, 'node_modules');
  if (!fs.existsSync(root)) return null;
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop();
    const marker = path.join(cur, 'next/dist/compiled/@next/font/dist/google/get-google-fonts-url.js');
    if (fs.existsSync(marker)) return path.dirname(marker);
    let ents = [];
    try {
      ents = fs.readdirSync(cur, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of ents) {
      if (e.isDirectory() && (e.name === 'next' || e.name === '.pnpm' || e.name.startsWith('next@') || e.name === 'node_modules')) {
        stack.push(path.join(cur, e.name));
      }
    }
  }
  return null;
}

function discoverFontsFromApp(app) {
  const found = [];
  const seen = new Set();
  const walk = (dir) => {
    let ents;
    try {
      ents = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of ents) {
      if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(tsx|ts|jsx|js)$/.test(e.name)) {
        const src = fs.readFileSync(p, 'utf8');
        if (!src.includes('next/font/google')) continue;
        const imp = /import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/.exec(src);
        if (!imp) continue;
        const names = imp[1].split(',').map((s) => s.trim().split(/\s+as\s+/).pop()).filter(Boolean);
        for (const name of names) {
          const call = new RegExp(`\\b${name}\\s*\\(\\s*(\\{[\\s\\S]*?\\})\\s*\\)`).exec(src);
          let opts = { subsets: ['latin'] };
          if (call) {
            try {
              opts = Function(`"use strict"; return (${call[1]})`)();
            } catch {
              /* keep default */
            }
          }
          const family = name.replace(/_/g, ' ');
          const key = family + JSON.stringify(opts);
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ family, opts });
        }
      }
    }
  };
  for (const sub of ['src', 'app', 'pages', '.']) walk(path.join(app, sub));
  return found;
}

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return res.text();
}

async function fetchBin(url) {
  const res = await fetch(url, { headers: { 'user-agent': UA } });
  if (!res.ok) throw new Error(`GET ${url} -> ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Mirror next/font getGoogleFontsUrl for common cases when next isn't resolvable. */
function fallbackGoogleUrl(family, opts = {}) {
  const display = opts.display || 'swap';
  const weight = opts.weight;
  let url = `https://fonts.googleapis.com/css2?family=${family.replace(/ /g, '+')}`;
  if (Array.isArray(weight) && weight.length) {
    url += `:wght@${weight.join(';')}`;
  } else if (!weight) {
    // variable default like Inter
    url += ':wght@100..900';
  }
  url += `&display=${display}`;
  return url;
}

const googleDir = findNextGoogleDir(appDir) || findNextGoogleDir(path.join(appDir, '../..'));
let resolveGoogleUrl = null;
if (googleDir) {
  const req = createRequire(path.join(googleDir, 'loader.js'));
  const { validateGoogleFontFunctionCall } = req('./validate-google-font-function-call.js');
  const { getFontAxes } = req('./get-font-axes.js');
  const { getGoogleFontsUrl } = req('./get-google-fonts-url.js');
  resolveGoogleUrl = (family, opts) => {
    const v = validateGoogleFontFunctionCall(family.replace(/ /g, '_'), opts);
    const axes = getFontAxes(v.fontFamily, v.weights, v.styles, v.selectedVariableAxes);
    return getGoogleFontsUrl(v.fontFamily, axes, v.display);
  };
  console.log(`using next/font helpers from ${googleDir}`);
} else {
  console.warn('next/font helpers not found — using fallback URL builder');
}

const specs = fonts.length
  ? fonts.map((f) => {
      const i = f.indexOf(':');
      if (i < 0) return { family: f, opts: { subsets: ['latin'] } };
      return { family: f.slice(0, i), opts: JSON.parse(f.slice(i + 1)) };
    })
  : discoverFontsFromApp(appDir);

if (!specs.length) {
  console.log('no next/font/google usage found — nothing to prefetch');
  process.exit(0);
}

const mock = {};
let nFiles = 0;

for (const { family, opts } of specs) {
  let url;
  try {
    url = resolveGoogleUrl ? resolveGoogleUrl(family, opts) : fallbackGoogleUrl(family, opts);
  } catch (e) {
    console.warn(`axes for ${family} failed (${e.message}); using fallback URL`);
    url = fallbackGoogleUrl(family, opts);
  }

  console.log(`prefetch ${family} -> ${url}`);
  const css = await fetchText(url);
  const fileUrls = [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com[^)]+)\)/g)].map((m) => m[1]);
  let rewritten = css;
  for (const fu of fileUrls) {
    const base = path.basename(new URL(fu).pathname) || `f${nFiles}.woff2`;
    const localName = `${family.replace(/\s+/g, '')}-${nFiles}-${base}`;
    const localPath = path.join(fontDir, localName);
    if (!fs.existsSync(localPath)) {
      fs.writeFileSync(localPath, await fetchBin(fu));
    }
    nFiles++;
    // Absolute path starting with / — next mock mode readFileSync(url)
    rewritten = rewritten.split(fu).join(localPath);
  }
  mock[url] = rewritten;
  // Also key common near-miss URL forms
  mock[url.replace(/ /g, '+')] = rewritten;
}

const mockPath = path.join(outDir, 'mocked-google-fonts.cjs');
fs.writeFileSync(
  mockPath,
  `/* generated by prefetch-google-fonts.mjs */\nmodule.exports = ${JSON.stringify(mock, null, 2)};\n`,
);
console.log(`wrote ${mockPath} (${Object.keys(mock).length} entries, ${nFiles} font files)`);
console.log(`NEXT_FONT_GOOGLE_MOCKED_RESPONSES=${mockPath}`);
