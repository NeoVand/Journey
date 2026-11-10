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

test('a turn the story has not reached yet is one press away', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/#the-whole-fix-in-ten-turns');
	const sixth = page.getByRole('button', { name: /^Turn 6:/ });
	// The page cuts to the chapter once the world is built, and the later turns wait ahead.
	await expect(sixth).toHaveAttribute('aria-label', /ahead/, { timeout: 90_000 });
	await sixth.click();
	// The story plays briskly on to it and rests there. That takes a second with a GPU and longer without.
	await expect(sixth).toHaveAttribute('aria-current', 'true', { timeout: 60_000 });
	await expect(sixth).not.toHaveAttribute('aria-label', /ahead/);
});

test('the arrow keys step through the story a card at a time', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	const back = page.getByRole('button', { name: 'Previous step' });
	await expect(back).toBeDisabled();
	await page.keyboard.press('ArrowRight');
	// One step on: the scroll bar keeps count, a screen per card.
	await page.waitForFunction(() => scrollY > innerHeight * 0.5, null, { timeout: 10_000 });
	const one = await page.evaluate(() => scrollY);
	// Pressed again on the way, it lines up one more card, and however often it's pressed, no further than that.
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => scrollY)).toBe(one * 2);
	await expect(back).toBeEnabled({ timeout: 60_000 });
});

test('the Begin key plays the first card', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	await page.getByRole('button', { name: 'Begin' }).click();
	await page.waitForFunction(() => scrollY > innerHeight * 0.5, null, { timeout: 10_000 });
	await expect(page.getByRole('button', { name: 'Previous step' })).toBeEnabled({ timeout: 60_000 });
});

test("the header's talk key plays this card's conversation, and pauses it", async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	const talk = page.getByRole('button', { name: /^Listen to Nora and Theo talk about this card, \d+ minutes?/ });
	// The header's keys wake once the world is built, which takes a while without a GPU.
	await expect(talk).toBeEnabled({ timeout: 120_000 });
	await talk.click();
	await expect(talk).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
	await talk.click();
	await expect(talk).toHaveAttribute('aria-pressed', 'false');
});

test('the player under the talk key scrubs, skips and changes speed', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	const talk = page.getByRole('button', { name: /^Listen to Nora and Theo talk about this card/ });
	await expect(talk).toBeEnabled({ timeout: 120_000 });
	// Resting the pointer on the key drops the player from it.
	await talk.hover();
	const player = page.getByRole('group', { name: /Player for this card/ });
	await expect(player).toBeVisible();
	const at = player.getByRole('slider', { name: 'Where in the conversation' });
	await player.getByRole('button', { name: 'Ahead 15 seconds' }).click();
	await expect.poll(async () => Number(await at.inputValue())).toBeGreaterThanOrEqual(14);
	await player.getByRole('radio', { name: '1.5×' }).click();
	await expect(player.getByRole('radio', { name: '1.5×' })).toHaveAttribute('aria-checked', 'true');
	// Away from the key and the plate, it goes again.
	await page.mouse.move(10, 500);
	await expect(player).toBeHidden();
});

test('the player turns on subtitles that follow what is being said, and turns them off', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	const talk = page.getByRole('button', { name: /^Listen to Nora and Theo talk about this card/ });
	await expect(talk).toBeEnabled({ timeout: 120_000 });
	await talk.hover();
	const player = page.getByRole('group', { name: /Player for this card/ });
	const subtitles = player.getByRole('button', { name: 'Subtitles' });
	await expect(subtitles).toHaveAttribute('aria-pressed', 'false');
	await subtitles.click();
	await expect(subtitles).toHaveAttribute('aria-pressed', 'true');
	await player.getByRole('button', { name: 'Play' }).click();
	// The words on screen are the line being said, under the speaker's name.
	const line = page.locator('.subtitles .line');
	await expect(line).toHaveText(/^(Nora|Theo)\S.{6,}/, { timeout: 30_000 });
	await subtitles.click();
	await expect(line).toHaveCount(0);
});

test('a jump from the map lets the conversation go, and the card it lands on waits for the key', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	const talk = page.getByRole('button', { name: /^Listen to Nora and Theo talk about this card/ });
	await expect(talk).toBeEnabled({ timeout: 120_000 });
	await talk.click();
	await expect(talk).toHaveAttribute('aria-pressed', 'true', { timeout: 30_000 });
	await page.getByRole('button', { name: /Open the map/ }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'One model, many chips', exact: true }).click();
	await expect(page).toHaveURL(/#one-model-many-chips/);
	// Well past the moment a followed conversation would have started on its own.
	await page.waitForTimeout(3000);
	await expect(talk).toHaveAttribute('aria-pressed', 'false');
});

test('the tour shows the controls, can turn the sound on, asks for a star, and ends with Begin', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	await page.getByRole('button', { name: 'Show me around' }).click();
	const tour = page.getByRole('dialog', { name: 'Before you set off' });
	await expect(tour).toBeVisible();
	await tour.getByRole('button', { name: 'Show me' }).click();
	await expect(page.getByRole('dialog', { name: 'One card at a time' })).toBeVisible();
	// The arrow keys move through the tour while it's open, not through the story.
	await page.keyboard.press('ArrowRight');
	await expect(page.getByRole('dialog', { name: 'Or watch it like a film' })).toBeVisible();
	await page.keyboard.press('ArrowRight');
	await page.keyboard.press('ArrowRight');
	const sound = page.getByRole('dialog', { name: 'Sound, if you like' });
	await expect(sound).toBeVisible();
	expect(await page.evaluate(() => scrollY)).toBe(0);
	await sound.getByRole('button', { name: 'Turn the sound on' }).click();
	await expect(page.locator('header').getByRole('button', { name: 'Sound', exact: true })).toHaveAttribute('aria-pressed', 'true');
	await sound.getByRole('button', { name: 'Next' }).click();
	await page.getByRole('dialog', { name: 'The map' }).getByRole('button', { name: 'Next' }).click();
	// The last stop is the source in the corner: a star, feedback, and Begin.
	const last = page.getByRole('dialog', { name: 'Made in the open' });
	await expect(last.getByRole('link', { name: 'Star on GitHub' })).toHaveAttribute('href', 'https://github.com/NeoVand/Journey');
	await expect(page.getByRole('link', { name: 'Source on GitHub' })).toHaveAttribute('target', '_blank');
	await last.getByRole('button', { name: 'Begin' }).click();
	await expect(page.getByRole('dialog')).toBeHidden();
	await page.waitForFunction(() => scrollY > innerHeight * 0.5, null, { timeout: 10_000 });
});

test('the arrow keys move the choice inside the agent tray, not the story', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	const tray = page.locator('main').getByRole('radiogroup', { name: 'Which coding agent do you use?' });
	await tray.getByRole('radio', { name: /Claude Code/ }).focus();
	await page.keyboard.press('ArrowRight');
	await expect(tray.getByRole('radio', { name: /Codex/ })).toHaveAttribute('aria-checked', 'true');
	await expect(tray.getByRole('radio', { name: /Codex/ })).toBeFocused();
	await page.keyboard.press('End');
	await expect(tray.getByRole('radio', { name: /Copilot/ })).toHaveAttribute('aria-checked', 'true');
	await page.waitForTimeout(300);
	expect(await page.evaluate(() => scrollY)).toBe(0);
});

test('a phone never has to scroll sideways on the title page', async ({ browser }) => {
	test.setTimeout(150_000);
	const phone = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });
	const page = await phone.newPage();
	await page.goto('/');
	await expect(page.getByRole('button', { name: /Memory, forks and rewinds/ }).first()).toBeVisible();
	const [wide, room] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
	expect(wide).toBeLessThanOrEqual(room);
	// Every side trip's ticket sits wholly on the screen, with no row to swipe.
	for (const box of await page.locator('.trip-set .trip-cloud').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()))) {
		expect(box.left).toBeGreaterThanOrEqual(0);
		expect(box.right).toBeLessThanOrEqual(360);
	}
	await phone.close();
});

test('one flick of the wheel is one step, however far it would have scrolled', async ({ page }) => {
	test.setTimeout(150_000);
	await page.goto('/');
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	// Fifteen notches, 30 ms apart by their own clocks, however long the page takes to handle them.
	await page.evaluate(() => {
		const at = performance.now();
		for (let i = 0; i < 15; i++) {
			const e = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true });
			Object.defineProperty(e, 'timeStamp', { value: at + i * 30 });
			document.body.dispatchEvent(e);
		}
	});
	await page.waitForTimeout(400);
	const one = await page.evaluate(() => scrollY);
	expect(one).toBeGreaterThan(0);
	expect(one).toBeLessThan(await page.evaluate(() => innerHeight * 1.5));
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

test('the trip into plans and to-do lists drops in through the laptop screen and comes back out', async ({ page }) => {
	test.setTimeout(180_000);
	type Debug = { __world: { trackIn: boolean; trackId: string | null } };
	await page.goto('/?debug#around-the-loop');
	await page.waitForFunction(() => document.querySelector('main.driven') && scrollY > innerHeight, null, { timeout: 90_000 });
	const before = await page.evaluate(() => scrollY);
	await page.getByRole('button', { name: 'Plans and to-do lists' }).first().click();
	await expect(page.getByRole('region', { name: 'Side trip: Plans and to-do lists' })).toBeVisible();
	await expect(page.locator('.spine p')).toContainText('Side trip 1 of 6');
	await expect(page.getByRole('heading', { name: 'Look first, change nothing' })).toBeVisible();
	// Close enough to fly: the camera goes to the laptop's screen, and only then is the world swapped for the trip's place.
	await page.waitForFunction(() => (window as unknown as Debug).__world.trackIn, null, { timeout: 60_000 });
	expect(await page.evaluate(() => (window as unknown as Debug).__world.trackId)).toBe('plans');
	await page.keyboard.press('Escape');
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

type Film = { __film: { state(): { T: number; flying: boolean; filming: boolean }; director: { target: number } }; __narrator: { id: string | null; playing: boolean } };

test('Play runs the story like a film: the scene, then its conversation, on to the next, and Pause stops it all', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/?debug');
	const key = page.locator('header button.film');
	await expect(key).toBeEnabled({ timeout: 120_000 });
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	await page.keyboard.press('k');
	await expect(key).toHaveAttribute('aria-pressed', 'true');
	// The title card's conversation comes first, a breath after the film begins.
	await page.waitForFunction(() => (window as unknown as Film).__narrator.id === 'how-a-coding-agent-works' && (window as unknown as Film).__narrator.playing, null, { timeout: 30_000 });
	// A step on, while it plays: the next card's scene plays, and the film carries on into that card's conversation.
	await page.keyboard.press('ArrowRight');
	await page.waitForFunction(() => (window as unknown as Film).__narrator.id === 'it-starts-as-a-sentence' && (window as unknown as Film).__narrator.playing, null, { timeout: 90_000 });
	await expect(key).toHaveAttribute('aria-pressed', 'true');
	// Pause stops the voices with the film.
	await page.keyboard.press('k');
	await expect(key).toHaveAttribute('aria-pressed', 'false');
	await page.waitForFunction(() => !(window as unknown as Film).__narrator.playing, null, { timeout: 5_000 });
});

test('without the voices, the film holds each card long enough to read it, then moves on by itself', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/?debug');
	const key = page.locator('header button.film');
	await expect(key).toBeEnabled({ timeout: 120_000 });
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	await key.hover();
	const plate = page.getByRole('group', { name: 'The whole story, as a film' });
	const voices = plate.getByRole('button', { name: 'Voices' });
	await expect(voices).toHaveAttribute('aria-pressed', 'true');
	await voices.click();
	await expect(voices).toHaveAttribute('aria-pressed', 'false');
	await plate.getByRole('button', { name: 'Play the whole story' }).click();
	// The title card is read, then the first scene plays: nobody talks.
	await page.waitForFunction(() => scrollY > innerHeight * 0.5, null, { timeout: 60_000 });
	expect(await page.evaluate(() => (window as unknown as Film).__narrator.playing)).toBe(false);
	await expect(key).toHaveAttribute('aria-pressed', 'true');
});

test('a step back plays the scene backwards, however long it is, with no cut', async ({ page }) => {
	test.setTimeout(300_000);
	await page.goto('/?debug#turn-two-starts-ahead');
	await page.waitForFunction(
		() => {
			const f = (window as unknown as Film).__film;
			if (!f) return false;
			const s = f.state();
			return !s.flying && Math.abs(s.T - f.director.target) < 1e-4 && s.T > 11;
		},
		null,
		{ timeout: 150_000 }
	);
	const from = await page.evaluate(() => (window as unknown as Film).__film.state().T);
	await page.keyboard.press('ArrowLeft');
	const to = await page.evaluate(() => (window as unknown as Film).__film.director.target);
	expect(to).toBeLessThan(from - 0.2);
	// Every frame until it gets there: without a GPU a frame can take half a second, and the scene never skips ahead.
	const run = await page.evaluate(
		(to) =>
			new Promise<{ Ts: number[]; covered: boolean }>((done) => {
				const Ts: number[] = [];
				let covered = false;
				const t0 = performance.now();
				const tick = () => {
					Ts.push((window as unknown as Film).__film.state().T);
					const veil = document.querySelector<HTMLElement>('[data-veil]');
					if (document.querySelector('[data-cut]')?.classList.contains('on') || (veil && +veil.style.opacity > 0)) covered = true;
					if (performance.now() - t0 < 120_000 && Math.abs(Ts.at(-1)! - to) > 1e-4) requestAnimationFrame(tick);
					else done({ Ts, covered });
				};
				requestAnimationFrame(tick);
			}),
		to
	);
	expect(run.covered).toBe(false);
	// All the way back to the card before, through the moments between: never forwards, and never in one leap.
	expect(run.Ts.at(-1)!).toBeCloseTo(to, 4);
	for (let i = 1; i < run.Ts.length; i++) expect(run.Ts[i]).toBeLessThanOrEqual(run.Ts[i - 1] + 1e-9);
	expect(new Set(run.Ts.map((t) => t.toFixed(3))).size).toBeGreaterThan(4);
});

test("the film's rail scrubs the story either way, and the picture goes with it", async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto('/?debug');
	const key = page.locator('header button.film');
	await expect(key).toBeEnabled({ timeout: 120_000 });
	await page.waitForFunction(() => document.querySelector('main.driven'), null, { timeout: 90_000 });
	await key.hover();
	const plate = page.getByRole('group', { name: 'The whole story, as a film' });
	await expect(plate).toBeVisible();
	const box = (await plate.locator('.strip').boundingBox())!;
	const y = box.y + box.height / 2;
	const T = () => page.evaluate(() => (window as unknown as Film).__film.state().T);
	const drag = async (from: number, to: number) => {
		await page.mouse.move(box.x + box.width * from, y);
		await page.mouse.down();
		for (let i = 1; i <= 12; i++) {
			await page.mouse.move(box.x + box.width * (from + ((to - from) * i) / 12), y);
			await page.waitForTimeout(40);
		}
		await page.mouse.up();
	};
	// Forwards: the story follows the drag on into the first chapters.
	await drag(0.01, 0.16);
	await expect.poll(T, { timeout: 30_000 }).toBeGreaterThan(3);
	const ahead = await T();
	// And back again.
	await drag(0.16, 0.04);
	await expect.poll(T, { timeout: 30_000 }).toBeLessThan(ahead - 1);
	await expect(plate.getByRole('slider', { name: 'Where in the story' })).toHaveAttribute('aria-valuetext', /of \d+:\d\d:\d\d/);
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
