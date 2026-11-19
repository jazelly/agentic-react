// node console.mjs <playwright-module-dir> <url> [waitMs]
// Prints every browser console message and pageerror in order: "[type] text" / "[pageerror] stack".
import { createRequire } from 'node:module';
const [pwDir, url, waitMs = '4000'] = process.argv.slice(2);
const { chromium } = createRequire(pwDir + '/')('playwright');
const browser = await chromium.launch();
const vw = process.env.VIEWPORT_W ? { viewport: { width: Number(process.env.VIEWPORT_W), height: 800 } } : {};
const page = await browser.newPage(vw);
page.on('console', (m) => console.log(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => console.log(`[pageerror] ${e.stack ?? e}`));
const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 }).catch((e) => { console.log(`[goto-failed] ${e.message}`); return null; });
await page.waitForTimeout(Number(waitMs));
await browser.close();
if (res) console.error(`# HTTP ${res.status()} ${url}`);
