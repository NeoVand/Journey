import { expect, test } from '@playwright/test';

test('has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('the map goes to a chapter and gives it an address', async ({ page }) => {
	// Without a GPU, building the world takes most of a minute, and the page is busy until it's done.
	test.setTimeout(120_000);
	await page.goto('/');
	await page.getByRole('button', { name: /open the map of the trip/i }).click();
	const map = page.getByRole('dialog', { name: 'Map of the trip' });
	await expect(map).toBeVisible();
	await map.getByRole('button', { name: 'One token is chosen', exact: true }).click();
	await expect(map).toBeHidden();
	await expect(page).toHaveURL(/#one-token-is-chosen$/);
});

test('the tokenizer cuts what you type', async ({ page }) => {
	test.setTimeout(120_000);
	await page.goto('/?still');
	await page.waitForFunction(() => '__journey' in window, null, { timeout: 90_000 });
	await page.evaluate(() => (window as unknown as { __journey: { seek(T: number): void } }).__journey.seek(6.62));
	await page.getByRole('button', { name: 'Cut your own sentence' }).click();
	const sheet = page.getByRole('dialog', { name: 'Try the tokenizer' });
	await sheet.getByRole('textbox').fill('job_scheduler.py');
	await expect(sheet.getByText('characters')).toContainText('from 16 characters', { timeout: 30_000 });
	await page.keyboard.press('Escape');
	await expect(sheet).toBeHidden();
});

test('a drawer in the scene can be pulled out', async ({ page }) => {
	test.setTimeout(120_000);
	type Debug = { __journey: { seek(T: number): void }; __world: { harness: { drawerHits: { getWorldPosition(v: unknown): { project(c: unknown): { x: number; y: number } }; position: { constructor: new () => unknown } }[] }; stage: { camera: unknown } } };
	await page.goto('/?still&debug');
	await page.waitForFunction(() => '__world' in window, null, { timeout: 90_000 });
	const seek = () => page.evaluate(() => (window as unknown as Debug).__journey.seek(2.1));
	await seek();
	await seek();
	const [x, y] = await page.evaluate(() => {
		const { __world: w } = window as unknown as Debug;
		const hit = w.harness.drawerHits[2];
		const v = hit.getWorldPosition(new hit.position.constructor()).project(w.stage.camera);
		return [((v.x + 1) / 2) * innerWidth, ((1 - v.y) / 2) * innerHeight];
	});
	await page.mouse.click(x, y);
	await seek();
	await expect(page.locator('.steps li.on strong').first()).toHaveText('Tools');
});

test('a turn the story has not reached yet scrolls the page on to it', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/#the-whole-fix-in-ten-turns');
	const sixth = page.getByRole('button', { name: /^Turn 6:/ });
	// The page cuts to the chapter once the world is built, and the later turns wait ahead.
	await expect(sixth).toHaveAttribute('aria-label', /ahead/, { timeout: 90_000 });
	await page.waitForFunction(() => scrollY > innerHeight * 10, null, { timeout: 30_000 });
	const before = await page.evaluate(() => scrollY);
	await sixth.click();
	// Five turns on, at about two thirds of a screen each. The story then plays them on its way there, which
	// takes seconds with a GPU and minutes without, so this checks the scroll it asked for.
	await page.waitForFunction((before) => scrollY > before + innerHeight * 3, before, { timeout: 30_000 });
});

test('the arrow keys step through the story a card at a time', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	const back = page.getByRole('button', { name: 'Previous step' });
	await expect(back).toBeDisabled();
	await page.keyboard.press('ArrowRight');
	// One step on: the page moves to where the first card's scene has finished.
	await page.waitForFunction(() => scrollY > innerHeight * 0.5, null, { timeout: 10_000 });
	const one = await page.evaluate(() => scrollY);
	// Pressed again on the way, it hurries this step along rather than skipping the next.
	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => scrollY)).toBe(one);
	await expect(back).toBeEnabled({ timeout: 60_000 });
});

test('a side trip opens over the story and brings the reader back to the same place', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/#the-harness-wakes-up');
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 90_000 });
	const before = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'How MCP connects' }).first().click();
	const trip = page.getByRole('region', { name: 'Side trip: How MCP connects' });
	await expect(trip).toBeVisible();
	await expect(page.locator('.spine p')).toContainText('Side trip 1 of 5');
	await expect(page.getByRole('heading', { name: 'A server is its own program' })).toBeVisible();
	await page.keyboard.press('Escape');
	await expect(trip).toBeHidden({ timeout: 10_000 });
	expect(await page.evaluate(() => scrollY)).toBe(before);
	await expect(page.locator('.spine p')).toContainText('Form');
});

test('a side trip ends by itself when the reader scrolls on past its last card', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/#the-harness-wakes-up');
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 90_000 });
	const before = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'How MCP connects' }).first().click();
	await expect(page.getByRole('region', { name: 'Side trip: How MCP connects' })).toBeVisible();
	await page.evaluate(() => {
		const trip = document.querySelector('[data-trip]')!;
		trip.scrollTop = trip.scrollHeight;
	});
	await expect(page.locator('[data-trip]')).toHaveCount(0, { timeout: 60_000 });
	expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('the trip inside the harness goes in through the roof and comes back out', async ({ page }) => {
	test.setTimeout(180_000);
	type Debug = { __world: { trackIn: boolean } };
	await page.goto('/?debug#the-harness-wakes-up');
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 90_000 });
	const before = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'Inside the harness' }).first().click();
	await expect(page.getByRole('region', { name: 'Side trip: Inside the harness' })).toBeVisible();
	await expect(page.getByRole('heading', { name: 'Bigger on the inside' })).toBeVisible();
	// The camera flies to the roof first, and only then is the world swapped for the room. Leaving while still
	// dropping in turns straight round.
	await page.waitForFunction(() => (window as unknown as Debug).__world.trackIn, null, { timeout: 60_000 });
	await page.keyboard.press('Escape');
	// Up out of the room, back through the roof, and home: every step of it waits on frames, which are slow without a GPU.
	await expect(page.locator('[data-trip]')).toHaveCount(0, { timeout: 90_000 });
	expect(await page.evaluate(() => (window as unknown as Debug).__world.trackIn)).toBe(false);
	expect(await page.evaluate(() => scrollY)).toBe(before);
});

test('the last chapter leaves nothing behind when the reader jumps back', async ({ page }) => {
	test.setTimeout(120_000);
	type Debug = { __journey: { seek(T: number): void }; __world: { finale: { group: { visible: boolean } } } };
	await page.goto('/?still&debug');
	await page.waitForFunction(() => '__world' in window, null, { timeout: 90_000 });
	const shownAt = (T: number) =>
		page.evaluate((T) => {
			const { __journey, __world } = window as unknown as Debug;
			__journey.seek(T);
			return __world.finale.group.visible;
		}, T);
	expect(await shownAt(32.9)).toBe(true);
	expect(await shownAt(3.5)).toBe(false);
});

test.describe('on a phone', () => {
	test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });

	test('the page stays inside a phone memory budget', async ({ page }) => {
		// A phone's browser closes a page that holds too much memory and loads it again, which looks like a crash. On
		// 2026-11-06 the page held about 360 MB of textures and crashed on an iPhone; this keeps it well below that.
		test.setTimeout(180_000);
		type Debug = { __world: { memory(): { textureMB: number; geometryMB: number } } };
		await page.goto('/?debug');
		await page.waitForFunction(() => document.querySelector('canvas')?.dataset.ready === 'true' && '__world' in window, null, { timeout: 150_000 });
		const memory = await page.evaluate(() => (window as unknown as Debug).__world.memory());
		expect(memory.textureMB).toBeLessThan(280);
		expect(memory.geometryMB).toBeLessThan(100);
	});
});
