// The picture in the harness's front window: the room the side trip goes into, seen straight on through it.
// node scripts/harness-window.mjs [az,el x,y,z radius] — writes static/harness/room.webp. Run it again whenever the room changes.
// The trip is opened from its card the way a reader does, its first scene is let settle, and then its camera is turned
// to look at the room's back wall from in front, where the window is: the drawers and the tray, clear of the corners.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';

const [angle = '0,8', target = '-1.4,2.9,-3.2', radius = '4.2'] = process.argv.slice(2);
const [az, el] = angle.split(',').map(Number);
const t = target.split(',').map(Number);
/** The window's shape: 1.7 wide by 2.06 tall, in the harness's own units. */
const W = 520;
const H = Math.round((W * 2.06) / 1.7);
const out = new URL('../static/harness/', import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, channel: 'chromium', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--mute-audio'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 2 });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto(`${process.env.URL ?? 'http://localhost:5199'}/?debug&trip=harness#the-harness-wakes-up`, { waitUntil: 'load' });
await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 120000 });
await page.getByRole('button', { name: 'Inside the harness' }).first().click();
await page.waitForSelector('[data-trip]');
await page.addStyleTag({ content: '.journey, .tip { visibility: hidden !important; }' });
await page.waitForFunction(() => Math.abs(window.__world.trackT - 0.848) < 0.01, null, { timeout: 90000, polling: 'raf' }).catch(() => console.log('did not settle'));
await page.evaluate(
	([az, el, t, r]) => {
		const w = window.__world;
		const ROOM = [0, 300, 0];
		const region = { x: 0, y: 0, w: 1, h: 1 };
		const shot = { az, el, target: [ROOM[0] + t[0], ROOM[1] + t[1], ROOM[2] + t[2]], radius: r, ry: r * 1.2, wide: region, tall: region };
		w.trackRigs.harness.shots = [{ T: -1, ...shot }, { T: 100, ...shot }];
	},
	[az, el, t, +radius]
);
await page.waitForTimeout(1500);
const png = await page.screenshot();
const data = await page.evaluate(
	async ({ b64, w, h }) => {
		const blob = await (await fetch(`data:image/png;base64,${b64}`)).blob();
		const src = await createImageBitmap(blob);
		const canvas = document.createElement('canvas');
		canvas.width = w;
		canvas.height = h;
		const g = canvas.getContext('2d');
		g.imageSmoothingQuality = 'high';
		g.drawImage(src, 0, 0, w, h);
		return canvas.toDataURL('image/webp', 0.84).split(',')[1];
	},
	{ b64: png.toString('base64'), w: W, h: H }
);
writeFileSync(new URL('room.webp', out), Buffer.from(data, 'base64'));
console.log('wrote static/harness/room.webp', W, 'x', H);
await browser.close();
