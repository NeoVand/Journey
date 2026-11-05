// How big each sign's words come out on screen: node scripts/legible.mjs [WxH] [phone] [harness]
// Visits every chapter at two resting points and keeps, for each sign, the largest size it reaches. Sizes are the
// font size in CSS pixels; below about 9 a phone reader can't make the words out. "phone" emulates a touch phone,
// which also turns on the page's phone tier.
import { chromium } from 'playwright';

const [size = '402x874', phone = 'phone', harness = 'claude'] = process.argv.slice(2);
const [width, height] = size.split('x').map(Number);
const mobile = phone === 'phone';
const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: mobile ? 3 : 2, hasTouch: mobile, isMobile: mobile });
const page = await ctx.newPage();
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?still&debug`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__journey && window.__world, null, { timeout: 120000 });
await page.evaluate((h) => window.__journey.seek(0, 0, h), harness);

const best = new Map();
for (let s = 0; s <= 32; s++) {
	for (const f of [0.35, 0.65]) {
		const T = s + f;
		await page.evaluate((T) => window.__journey.seek(T, 3.1), T);
		await page.waitForTimeout(250);
		const rows = await page.evaluate(() => {
			const w = window.__world;
			const cam = w.stage.camera;
			const V = cam.position.constructor;
			const out = [];
			w.stage.scene.traverseVisible((o) => {
				// A sign is a plate named 'sign' with its words as the next child.
				if (!o.isMesh || !o.parent || o.parent.children[0]?.name !== 'sign' || o.parent.children[1] !== o) return;
				const text = o.userData.text;
				if (!text || /^\d+%$/.test(text)) return;
				const g = o.geometry;
				if (!g.boundingBox) g.computeBoundingBox();
				const mid = new V().applyMatrix4(o.matrixWorld).project(cam);
				if (mid.z > 1 || Math.abs(mid.x) > 1 || Math.abs(mid.y) > 1) return;
				const a = new V(0, g.boundingBox.min.y, 0).applyMatrix4(o.matrixWorld).project(cam);
				const b = new V(0, g.boundingBox.max.y, 0).applyMatrix4(o.matrixWorld).project(cam);
				// The plane is 1.3 times the font size.
				out.push([(Math.abs(a.y - b.y) / 2) * innerHeight / 1.3, text]);
			});
			return out;
		});
		for (const [px, text] of rows) if (!best.has(text) || px > best.get(text).px) best.set(text, { px, T });
	}
}
const list = [...best.entries()].sort((a, b) => a[1].px - b[1].px);
for (const [text, { px, T }] of list) console.log(`${px.toFixed(1).padStart(5)} px  T ${T.toFixed(2)}  ${text}`);
const sizes = list.map(([, v]) => v.px);
const at = (q) => sizes[Math.min(sizes.length - 1, Math.floor(sizes.length * q))].toFixed(1);
console.log(`${sizes.length} signs. Quarter ${at(0.25)}, median ${at(0.5)}, three quarters ${at(0.75)} px.`);
await browser.close();
