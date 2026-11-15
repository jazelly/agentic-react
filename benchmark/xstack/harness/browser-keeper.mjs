// Keeps one headless Chromium tab open on the dev server for the whole agent run (both arms, for parity).
// agentic-react's MCP tools are answered by the in-page runtime, so a live tab is required for them to work.
// usage: node browser-keeper.mjs <url>   (exits on SIGTERM)
import { createRequire } from 'node:module';
import path from 'node:path';
import { VERIFIER, PW_BROWSERS } from './lib.mjs';
process.env.PLAYWRIGHT_BROWSERS_PATH ??= PW_BROWSERS;
const { chromium } = createRequire(path.join(VERIFIER, 'package.json'))('@playwright/test');
const url = process.argv[2];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', (m) => { if (m.type() === 'error') console.log('[console.error]', m.text().slice(0, 500)); });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 500)));
const go = async () => { try { await page.goto(url, { waitUntil: 'load', timeout: 60000 }); console.log('[keeper] loaded', url); } catch (e) { console.log('[keeper] goto failed', String(e).slice(0, 300)); } };
await go();
// if the dev server restarts (agent edits config) the page may die; re-open periodically when blank/crashed
const iv = setInterval(async () => { try { await page.evaluate('1'); } catch { await go(); } }, 5000);
const stop = async () => { clearInterval(iv); await browser.close().catch(() => {}); process.exit(0); };
process.on('SIGTERM', stop); process.on('SIGINT', stop);
