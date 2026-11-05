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
