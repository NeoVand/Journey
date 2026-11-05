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
