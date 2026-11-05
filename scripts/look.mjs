// Free camera for inspecting a prop: node scripts/look.mjs out.png WxH T az,el x,y,z radius [harness]
// Cards are hidden, so what you see is the model and nothing else.
import { chromium } from 'playwright';

const [out, size = '1000x700', T = '0', angle = '20,15', target = '0,0,0', radius = '4', harness] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const [az, el] = angle.split(',').map(Number);
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: +(process.env.DPR ?? 1) });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
await page.evaluate(
	([T, az, el, t, r, h]) => {
		document.querySelector('.journey').style.visibility = 'hidden';
		document.querySelector('[data-dive]').style.visibility = 'hidden';
		if (h) window.__journey.seek(0, 0, h);
		const w = window.__world;
		const region = { x: 0.04, y: 0.04, w: 0.92, h: 0.92 };
		const shot = { az, el, target: t, radius: r, ry: r, wide: region, tall: region };
		w.rig.shots = [{ T: -1, ...shot }, { T: 100, ...shot }];
		w.update(T, 3.1, 1, 0, 0, true);
	},
	[+T, az, el, target.split(',').map(Number), +radius, harness]
);
await page.waitForTimeout(250);
await page.evaluate((T) => window.__world.update(T, 3.1, 1, 0, 0, true), +T);
await page.waitForTimeout(80);
await page.screenshot({ path: out });
if (errors.length) console.log(errors.join('\n'));
await browser.close();
