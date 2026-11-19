// usage: node browser-cap.mjs <playwright-module-dir> <url> <outfile> [settleMs]
// Records every console message as "[type] text" and every pageerror as "[pageerror] stack", in order.
import fs from 'node:fs';
import { createRequire } from 'node:module';
const [pwDir, url, out, settle = '3000'] = process.argv.slice(2);
const { chromium } = createRequire(pwDir + '/')('playwright');
const lines = [];
const browser = await chromium.launch();
const page = await browser.newPage(process.env.PW_TZ ? { timezoneId: process.env.PW_TZ } : {});
page.on('console', (m) => lines.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => lines.push(`[pageerror] ${e.stack || String(e)}`));
const resp = await page.goto(url, { waitUntil: 'networkidle' }).catch((e) => { lines.push(`[goto-failed] ${e.message}`); return null; });
await page.waitForTimeout(Number(settle));
console.log(`browser=${browser.version()} status=${resp?.status()} messages=${lines.length}`);
await browser.close();
fs.writeFileSync(out, lines.join('\n') + (lines.length ? '\n' : ''));
