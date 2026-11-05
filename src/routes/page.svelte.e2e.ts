import { expect, test } from '@playwright/test';

test('has expected h1', async ({ page }) => {
	await page.goto('/');
	await expect(page.locator('h1')).toBeVisible();
});

test('the map goes to a chapter and gives it an address', async ({ page }) => {
	await page.goto('/');
	await page.getByRole('button', { name: /open the map/i }).click();
	const map = page.getByRole('dialog', { name: 'Map of the trip' });
	await expect(map).toBeVisible();
	await map.getByRole('button', { name: 'One token is chosen', exact: true }).click();
	await expect(map).toBeHidden();
	await expect(page).toHaveURL(/#one-token-is-chosen$/);
});
