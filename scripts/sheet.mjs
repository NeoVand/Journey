// Contact sheet: node scripts/sheet.mjs out.png cols cellWidth file...
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const [out, cols, w, ...files] = process.argv.slice(2);
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: (+w + 6) * +cols, height: 100 } });
const imgs = files.map((f) => `<figure><img src="data:image/png;base64,${readFileSync(f).toString('base64')}"><figcaption>${f.split('/').pop()}</figcaption></figure>`).join('');
await page.setContent(`<style>body{margin:0;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;background:#fff}figure{margin:0;position:relative}img{width:100%;display:block}figcaption{position:absolute;left:4px;bottom:4px;font:12px monospace;background:#000;color:#fff;padding:1px 4px}</style>${imgs}`);
await page.waitForTimeout(200);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
