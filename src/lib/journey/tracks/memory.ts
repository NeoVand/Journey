import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { Card, machine, shadowOn } from '../kit/machines';
import { Lamp, color, mats } from '../kit/materials';
import { bell, inOut, outBack, seg, smooth } from '../kit/math';
import { createSign, grown } from '../kit/parts';
import { font } from '../kit/print';
import { createIsland } from '../props/island';
import { Cloudscape } from '../props/sky';
import type { HarnessId } from '../content';
import type { Shot } from '../rig';

/**
 * The side trip into memory, forks and rewinding: a stage of its own, high above the story, reached by dropping into
 * the memory cabinet. Time runs left to right. Yesterday's session on the left, today's on the right, and between them
 * the shelf of notes that outlive a session. Your files lie in front, shared by every session, and off to the right
 * stands the git host, where whatever has been pushed lives on.
 */
export const MEMORY_AT = new THREE.Vector3(0, 900, 0);
export const MEMORY_SKY = { top: new THREE.Color('#9fd0f8'), mid: new THREE.Color('#c6e5fd'), low: new THREE.Color('#ecf7ff') };

/** Where you drop in: straight down onto the top of the memory cabinet, in the story's coordinates. */
export const CABINET_ROOF: Omit<Shot, 'T'> = {
	az: -12,
	el: 62,
	target: [-48, 16.6, -4],
	radius: 1.6,
	ry: 1.1,
	wide: { x: 0, y: 0, w: 1, h: 1 },
	tall: { x: 0, y: 0, w: 1, h: 1 }
};

/* ---------- the layout ---------- */

/** A session is a rail of pages: one per message, standing while the session is live. */
const RAIL_Z = -0.2;
const FORK_Z = 1.9;
const PITCH = 1.32;
const A_X = -14.0;
const B_X = 1.6;
const SLOTS = { a: 5, b: 6, f: 6 };
const SHELF = new THREE.Vector3(-2.9, 0, -3.3);
const FILES = new THREE.Vector3(-0.8, 0, 3.2);
const SNAP = new THREE.Vector3(1.9, 0, 3.3);
const HOST = new THREE.Vector3(11.8, 0, -3.2);

const slotX = (rail: 'a' | 'b' | 'f', i: number) => (rail === 'a' ? A_X : B_X) + i * PITCH;
const slots = (rail: 'a' | 'b' | 'f') => SLOTS[rail];
const railZ = (rail: 'a' | 'b' | 'f') => (rail === 'f' ? FORK_Z : RAIL_Z);

const at = (t: number, card: number, a: number, b: number) => seg(t - card, a, b);

/* ---------- the camera, in the stage's own coordinates ---------- */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);
const shot = (az: number, el: number, target: [number, number, number], radius: number, ry = radius * 0.6, extra: Partial<Shot> = {}): Omit<Shot, 'T'> => ({
	az,
	el,
	target: [target[0] + MEMORY_AT.x, target[1] + MEMORY_AT.y, target[2] + MEMORY_AT.z],
	radius,
	ry,
	wide: WIDE,
	tall: TALL,
	...extra,
	// A phone's own subject is given in the stage's coordinates too.
	...(extra.tallTarget && {
		tallTarget: [extra.tallTarget[0] + MEMORY_AT.x, extra.tallTarget[1] + MEMORY_AT.y, extra.tallTarget[2] + MEMORY_AT.z] as [number, number, number]
	})
});
const YESTERDAY = shot(10, 20, [-11.4, 1.0, 0.0], 3.7, 2.0, { tallRadius: 3.8 });
const TODAY = shot(-8, 18, [4.2, 1.0, -0.2], 3.6, 1.9, { tallTarget: [3.2, 1.0, -0.2], tallRadius: 2.6 });
const HANDOVER = shot(4, 24, [-3.0, 1.0, -1.4], 6.4, 2.8, { tallTarget: [-0.6, 1.0, -1.6], tallRadius: 4.3 });
const WORK = shot(0, 24, [5.2, 1.0, 0.4], 7.4, 3.2, { tallTarget: [2.6, 1.0, 1.4], tallRadius: 5.4, tallRy: 3.6 });
const FORKED = shot(6, 30, [4.9, 0.9, 1.0], 4.8, 2.6, { tallTarget: [4.6, 0.9, 1.0], tallRadius: 4.3 });
const REWIND = shot(0, 28, [3.0, 0.9, 1.4], 5.8, 2.8, { tallTarget: [1.6, 0.9, 1.4], tallRadius: 4.0 });
const BEYOND = shot(-8, 22, [7.4, 1.4, -1.2], 5.6, 2.8, { tallTarget: [9.4, 1.4, -1.6], tallRadius: 3.6 });

export const MEMORY_SHOTS: Shot[] = [
	{ T: 0, ...YESTERDAY },
	{ T: 0.54, ...YESTERDAY, az: 14 },
	{ T: 0.68, ...TODAY },
	{ T: 0.98, ...TODAY, az: -9 },
	{ T: 1.06, ...HANDOVER },
	{ T: 1.9, ...HANDOVER, az: 8 },
	{ T: 2.06, ...WORK },
	{ T: 2.9, ...WORK, az: -6 },
	{ T: 3.06, ...FORKED },
	{ T: 3.9, ...FORKED, az: 10 },
	{ T: 4.06, ...REWIND },
	{ T: 4.9, ...REWIND, az: 6 },
	{ T: 5.06, ...BEYOND },
	{ T: 6, ...BEYOND, az: -2 }
];

/* ---------- printed things ---------- */

type Kind = 'you' | 'model' | 'tool' | 'note' | 'rules';
const KIND: Record<Kind, { band: string; ink: string; label: string }> = {
	you: { band: color.ink, ink: '#ffffff', label: 'You' },
	model: { band: color.cobalt, ink: '#ffffff', label: 'Model' },
	tool: { band: '#12a956', ink: '#ffffff', label: 'Tool result' },
	note: { band: color.amber, ink: color.ink, label: 'Note' },
	rules: { band: '#e9dcc0', ink: color.ink, label: 'Rules' }
};

/** One message in a session: who it's from on a coloured band, and what it says. */
function page(kind: Kind, text: string) {
	const card = new Card(1.1, 0.8, 520, 0.02);
	const k = KIND[kind];
	card.draw((c, w, h) => {
		c.fillStyle = k.band;
		c.fillRect(0, 0, w, h * 0.26);
		c.fillStyle = k.ink;
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.14}px ${font.sans}`;
		c.fillText(k.label, w * 0.08, h * 0.135);
		c.fillStyle = color.ink;
		c.font = `600 ${h * 0.13}px ${font.mono}`;
		const room = w * 0.84;
		const words = text.split(' ');
		let line = '';
		let y = h * 0.46;
		for (const word of words) {
			const next = line ? `${line} ${word}` : word;
			if (c.measureText(next).width > room && line) {
				c.fillText(line, w * 0.08, y);
				line = word;
				y += h * 0.18;
			} else line = next;
		}
		c.fillText(line, w * 0.08, y);
	});
	return card;
}

/** The file every session shares: as yesterday fixed it, or with today's change that breaks a test. */
const FILE_STATES = [
	['while self.queue:', '+ with self._lock:', '+   job = self.queue.pop()', '  self._dispatch(job)'],
	['while self.queue:', '~ with self._mutex:', '+   job = self.queue.pop()', '  self._dispatch(job)']
];
function fileSheet(state: number) {
	const card = new Card(1.5, 1.0, 560, 0.01);
	card.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.fillRect(0, 0, w, h * 0.2);
		c.fillStyle = '#ffffff';
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.1}px ${font.mono}`;
		c.fillText('scheduler.py', w * 0.06, h * 0.1);
		FILE_STATES[state].forEach((line, i) => {
			const mark = line[0];
			if (mark === '+' || mark === '~') {
				c.fillStyle = mark === '+' ? 'rgba(34,211,107,.22)' : 'rgba(255,140,30,.24)';
				c.fillRect(0, h * (0.3 + i * 0.16) - h * 0.07, w, h * 0.14);
			}
			c.fillStyle = mark === '+' ? '#0c7a3e' : mark === '~' ? '#b4500a' : color.ink;
			c.font = `600 ${h * 0.085}px ${font.mono}`;
			c.fillText(line, w * 0.06, h * (0.3 + i * 0.16));
		});
	});
	return card;
}

/** A note on the shelf: a name, and one line of what it says. */
function noteCard(name: string, line: string) {
	const card = new Card(0.86, 0.5, 620, 0.02);
	card.draw((c, w, h) => {
		c.fillStyle = color.amber;
		c.fillRect(0, 0, w * 0.06, h);
		c.fillStyle = color.ink;
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.17}px ${font.mono}`;
		c.fillText(name, w * 0.13, h * 0.3);
		c.fillStyle = '#4d5a72';
		c.font = `500 ${h * 0.13}px ${font.sans}`;
		const room = w * 0.8;
		const width = c.measureText(line).width;
		if (width > room) c.font = `500 ${(h * 0.13 * room) / width}px ${font.sans}`;
		c.fillText(line, w * 0.13, h * 0.66);
	});
	return card;
}

/* ---------- the stage ---------- */

/** How far back a standing page leans. */
const LEAN = 0.16;
const PAGE_H = 0.8;
/** Where a page's bottom edge rests: on the rail, just above the groove along its top. */
const PAGE_FOOT = 0.152;

interface Page {
	card: Card;
}

export class MemoryStage {
	group = new THREE.Group();
	private clouds = new Cloudscape();
	/** Yesterday's session, today's, and the fork of today's. */
	private a: Page[] = [];
	private b: Page[] = [];
	private f: Page[] = [];
	private lamps: Record<'a' | 'b' | 'f', Lamp>;
	private railSigns: Record<'a' | 'b' | 'f', THREE.Group>;
	private forkRail: THREE.Group;
	/** The note written at the end of yesterday, and the copies that go into today's request. */
	private saved: Card;
	private shelfNotes: Card[] = [];
	private loaded: Card[] = [];
	private shelfLamps: Lamp[] = [];
	private files: Card[];
	private fileLamp: Lamp;
	private snapshot: Card;
	private parcel: THREE.Group;
	private hostLamp: Lamp;
	private kept: THREE.Group;
	private notUndone: THREE.Group;
	private shelfSigns: Record<HarnessId, THREE.Group>;
	private snapSigns!: Record<HarnessId, THREE.Group>;
	private v = new THREE.Vector3();
	private w = new THREE.Vector3();

	constructor() {
		const m = mats();
		const g = this.group;
		g.position.copy(MEMORY_AT);
		g.visible = false;

		g.add(
			createIsland([
				[-14.2, 2.6],
				[-12.4, 5.4],
				[0, 6.0],
				[11.8, 5.4],
				[14.0, 2.0],
				[13.4, -4.8],
				[8, -6.4],
				[-6, -6.4],
				[-13.4, -5.0],
				[-14.6, -1.0]
			])
		);

		/* -- the rails: one per session -- */
		const rail = (rail: 'a' | 'b' | 'f', name: string) => {
			const x0 = slotX(rail, 0) - 0.75;
			const x1 = slotX(rail, slots(rail) - 1) + 0.7;
			const z = railZ(rail);
			const group = new THREE.Group();
			const b = new Batch();
			b.add(rbox(x1 - x0, 0.12, 0.7, 0.04, 2), m.cream, { p: [(x0 + x1) / 2, 0.06, z] });
			b.add(rbox(x1 - x0 - 0.1, 0.03, 0.12, 0.012, 1), m.recess, { p: [(x0 + x1) / 2, 0.125, z] });
			group.add(b.build(`rail-${rail}`));
			shadowOn(group, (x0 + x1) / 2, 0, z, x1 - x0 + 0.3, 0.9, 0.3);
			const lamp = new Lamp(rbox(0.26, 0.12, 0.26, 0.05, 3), '#22d36b', 0.3);
			lamp.mesh.position.set(x0 + 0.25, 0.18, z + 0.18);
			group.add(lamp.mesh);
			const sign = createSign(name, 0.2);
			sign.position.set(x0 + 1.3, 0.21 + grown(0.2), z + 0.42);
			group.add(sign);
			g.add(group);
			return { group, lamp, sign };
		};
		const ra = rail('a', 'Yesterday');
		const rb = rail('b', 'Today');
		const rf = rail('f', 'A fork of today');
		this.forkRail = rf.group;
		this.lamps = { a: ra.lamp, b: rb.lamp, f: rf.lamp };
		this.railSigns = { a: ra.sign, b: rb.sign, f: rf.sign };

		const pages = (list: [Kind, string][]) =>
			list.map(([kind, text]) => {
				const card = page(kind, text);
				card.mesh.visible = false;
				g.add(card.mesh);
				return { card };
			});
		this.a = pages([
			['rules', 'CLAUDE.md, your rules'],
			['you', 'Fix the race in the job scheduler'],
			['model', 'Edit: take the lock'],
			['tool', '12 passed'],
			['model', 'Fixed, and tested']
		]);
		this.b = pages([
			['rules', 'CLAUDE.md, your rules'],
			['note', 'Notes from before'],
			['you', 'Add a test for two workers'],
			['model', 'git push'],
			['model', 'Edit: rename the lock'],
			['tool', '1 failed']
		]);
		this.f = pages([
			['rules', 'CLAUDE.md, your rules'],
			['note', 'Notes from before'],
			['you', 'Add a test for two workers'],
			['you', 'Try it with asyncio instead'],
			['model', 'Edit, in its own worktree'],
			['tool', '12 passed']
		]);

		/* -- the shelf of notes that outlive a session -- */
		const shelf = new Batch();
		shelf.add(rbox(4.4, 0.5, 1.0, 0.08, 3), m.cream, { p: [SHELF.x, 0.25, SHELF.z] });
		shelf.add(rbox(4.2, 0.05, 0.12, 0.02, 1), m.recess, { p: [SHELF.x, 0.5, SHELF.z + 0.1] });
		g.add(shelf.build('notes-shelf'));
		shadowOn(g, SHELF.x, 0, SHELF.z, 4.8, 1.3);
		const shelfSign = (text: string) => {
			const s = createSign(text, 0.2);
			s.position.set(SHELF.x, 0.25 + grown(0.2), SHELF.z + 0.53);
			g.add(s);
			return s;
		};
		this.shelfSigns = {
			claude: shelfSign('Kept on disk: CLAUDE.md and memory'),
			codex: shelfSign('Kept on disk: AGENTS.md'),
			copilot: shelfSign('Kept: instructions and memory')
		};
		[
			['MEMORY.md', 'An index of what was learned'],
			['testing.md', 'Run pytest -x, it takes 8 s'],
			['locking.md', 'One lock guards the queue'],
			['style.md', 'Small commits, clear names']
		].forEach(([name, line], i) => {
			const card = noteCard(name, line);
			card.mesh.position.set(SHELF.x - 1.62 + i * 1.08, 0.52 + 0.25 * Math.cos(LEAN), SHELF.z + 0.1 - 0.25 * Math.sin(LEAN));
			card.mesh.rotation.x = -LEAN;
			// locking.md isn't there yet: yesterday's session writes it.
			card.mesh.visible = i !== 2;
			g.add(card.mesh);
			this.shelfNotes.push(card);
			const lamp = new Lamp(new THREE.SphereGeometry(0.05, 12, 8), '#ffffff', 0.2);
			lamp.mesh.position.set(SHELF.x - 1.62 + i * 1.08, 0.52, SHELF.z + 0.42);
			g.add(lamp.mesh);
			this.shelfLamps.push(lamp);
		});
		// The note yesterday's session leaves behind, which flies to the shelf.
		this.saved = noteCard('locking.md', 'One lock guards the queue');
		this.saved.mesh.visible = false;
		g.add(this.saved.mesh);
		// The copies that go into today's request: the index, and the one note today's task needs.
		for (const [name, line] of [
			['MEMORY.md', 'An index of what was learned'],
			['testing.md', 'Run pytest -x, it takes 8 s']
		]) {
			const card = noteCard(name, line);
			card.mesh.visible = false;
			g.add(card.mesh);
			this.loaded.push(card);
		}

		/* -- your files, shared by every session -- */
		const tray = new Batch();
		tray.add(rbox(2.4, 0.2, 1.6, 0.06, 2), m.cream, { p: [FILES.x, 0.1, FILES.z] });
		tray.add(rbox(2.2, 0.05, 1.4, 0.03, 2), m.creamDeep, { p: [FILES.x, 0.21, FILES.z] });
		g.add(tray.build('files-tray'));
		shadowOn(g, FILES.x, 0, FILES.z, 2.7, 1.9);
		const filesSign = createSign('Your files', 0.2);
		filesSign.position.set(FILES.x, 0.2 + grown(0.2), FILES.z + 0.86);
		g.add(filesSign);
		this.files = [fileSheet(0), fileSheet(1)];
		for (const sheet of this.files) {
			sheet.mesh.position.set(FILES.x, 0.24 + 0.5 * Math.cos(0.5), FILES.z - 0.5 * Math.sin(0.5));
			sheet.mesh.rotation.x = -0.5;
			g.add(sheet.mesh);
		}
		this.fileLamp = new Lamp(rbox(0.22, 0.08, 0.22, 0.04, 3), '#ffffff', 0.2);
		this.fileLamp.mesh.position.set(FILES.x + 1.0, 0.26, FILES.z + 0.55);
		g.add(this.fileLamp.mesh);
		// A checkpoint: a copy of the file as it was before the edit, kept to one side.
		this.snapshot = fileSheet(0);
		this.snapshot.mesh.visible = false;
		g.add(this.snapshot.mesh);
		const snapStand = new Batch();
		snapStand.add(rbox(1.7, 0.1, 1.0, 0.04, 2), m.steelSoft, { p: [SNAP.x, 0.05, SNAP.z] });
		g.add(snapStand.build('checkpoint-stand'));
		const snapSign = (text: string) => {
			const sign = createSign(text, 0.18);
			sign.position.set(SNAP.x, 0.2 + grown(0.18), SNAP.z + 0.56);
			g.add(sign);
			return sign;
		};
		// Codex keeps no checkpoints: its way back is your last commit.
		this.snapSigns = { claude: snapSign('Checkpoint'), codex: snapSign('Your last commit'), copilot: snapSign('Checkpoint') };

		/* -- the git host, where pushed work lives on -- */
		const host = machine({ w: 1.8, h: 1.6, d: 1.3, name: 'Git host', finish: 'cobalt' });
		host.position.copy(HOST);
		g.add(host);
		shadowOn(g, HOST.x, 0, HOST.z, 2.2, 1.7);
		this.hostLamp = new Lamp(rbox(0.26, 0.1, 0.26, 0.04, 3), '#ffffff', 0.2);
		this.hostLamp.mesh.position.set(HOST.x + 0.6, 1.88, HOST.z + 0.2);
		g.add(this.hostLamp.mesh);
		this.parcel = new THREE.Group();
		const parcel = new Batch();
		parcel.add(rbox(0.5, 0.34, 0.4, 0.06, 3), m.amber, { p: [0, 0.17, 0] });
		this.parcel.add(parcel.build('commit-parcel'));
		const parcelSign = createSign('Your commit', 0.14);
		parcelSign.position.set(0, 0.5 + grown(0.14), 0);
		this.parcel.add(parcelSign);
		this.parcel.visible = false;
		g.add(this.parcel);
		this.kept = createSign('Still on the host', 0.2);
		this.kept.position.set(HOST.x, 2.95 + grown(0.2), HOST.z);
		this.kept.scale.setScalar(0.001);
		g.add(this.kept);
		this.notUndone = createSign('A rewind can’t reach this', 0.2, '#ffffff', m.red);
		this.notUndone.position.set(HOST.x, 0.26 + grown(0.2), HOST.z + 1.06);
		this.notUndone.scale.setScalar(0.001);
		g.add(this.notUndone);

		this.clouds.lay([{ shots: MEMORY_SHOTS, sky: () => true }], 22);
		g.add(this.clouds.group);
		this.setHarness('claude');
	}

	setHarness(id: HarnessId) {
		for (const [key, sign] of Object.entries(this.shelfSigns)) sign.visible = key === id;
		for (const [key, sign] of Object.entries(this.snapSigns)) sign.visible = key === id;
		const rules = { claude: 'CLAUDE.md, your rules', codex: 'AGENTS.md, your rules', copilot: 'Your instructions' }[id];
		for (const list of [this.a, this.b, this.f]) {
			const card = list[0].card;
			card.draw((c, w, h) => {
				c.fillStyle = KIND.rules.band;
				c.fillRect(0, 0, w, h * 0.26);
				c.fillStyle = color.ink;
				c.textBaseline = 'middle';
				c.font = `700 ${h * 0.14}px ${font.sans}`;
				c.fillText('Rules', w * 0.08, h * 0.135);
				c.font = `600 ${h * 0.13}px ${font.mono}`;
				c.fillText(rules, w * 0.08, h * 0.46);
			});
		}
	}

	/**
	 * A page standing on its rail, hinged at its bottom edge: 0 lying flat, 1 standing and leaning back a little. A
	 * spring's overshoot brings it up to plumb and no further. size scales it, from nothing to full.
	 */
	private stand(card: Card, rail: 'a' | 'b' | 'f', slot: number, up: number, size = 1) {
		const mesh = card.mesh;
		mesh.visible = size > 0.001;
		if (!mesh.visible) return;
		const angle = -(LEAN + (1 - Math.min(up, 1.1)) * (Math.PI / 2 - LEAN));
		const half = (PAGE_H * size) / 2;
		mesh.position.set(slotX(rail, slot), PAGE_FOOT + half * Math.cos(angle), railZ(rail) + half * Math.sin(angle));
		mesh.rotation.set(angle, 0, 0);
		mesh.scale.setScalar(Math.max(0.001, size));
	}

	/** Something flying in an arc from a to b, s from 0 to 1. */
	private arc(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, s: number, lift: number) {
		mesh.position.lerpVectors(a, b, s);
		mesh.position.y += Math.sin(Math.PI * s) * lift;
	}

	/** Where a page stands on its rail, for flying things to and from. */
	private slotPoint(rail: 'a' | 'b' | 'f', slot: number, out: THREE.Vector3) {
		return out.set(slotX(rail, slot), PAGE_FOOT + (PAGE_H / 2) * Math.cos(LEAN), railZ(rail) - (PAGE_H / 2) * Math.sin(LEAN));
	}

	/** t: the trip's own time, one unit per card. */
	update(t: number, time: number) {
		this.clouds.update(time);

		/* ---- card 1: yesterday's session, message by message, then it ends; today's starts with nothing of it ---- */
		this.a.forEach((p, i) => {
			const up = outBack(at(t, 0, 0.06 + i * 0.08, 0.12 + i * 0.08), 1.3);
			// When yesterday ends, its pages lie down where they stand: saved to disk, sent to no one.
			const down = inOut(at(t, 0, 0.48, 0.56));
			this.stand(p.card, 'a', i, up * (1 - down), Math.min(1, up * 1.6));
		});
		const aLive = seg(t, 0.04, 0.08) * (1 - seg(t, 0.48, 0.52));
		this.lamps.a.mix('#9aa6b8', '#22d36b', aLive, 0.3 + aLive * 1.4);

		// Today: its first page is only your rules again. The model kept nothing.
		const steps = [outBack(at(t, 0, 0.72, 0.78), 1.3), outBack(at(t, 1, 0.66, 0.72), 1.3), outBack(at(t, 1, 0.76, 0.82), 1.3)];
		// Card 3: today's own work, one page per message: the push, the change that breaks a test, and the test.
		for (const [a, b] of [
			[0.16, 0.22],
			[0.32, 0.38],
			[0.5, 0.56]
		])
			steps.push(outBack(at(t, 2, a, b), 1.3));
		// Card 5 rewinds today to just after your request: the pages after it lie back down and go.
		const rewound = inOut(at(t, 4, 0.16, 0.3));
		this.b.forEach((p, i) => {
			const back = i >= 3 ? rewound : 0;
			this.stand(p.card, 'b', i, steps[i] * (1 - back), Math.min(1, steps[i] * 1.6) * (1 - smooth(seg(back, 0.6, 1))));
		});
		const bLive = seg(t, 0.7, 0.74);
		this.lamps.b.mix('#9aa6b8', '#22d36b', bLive, 0.3 + bLive * 1.4);

		/* ---- card 2: a note outlives yesterday, and today's request starts with what it needs from the shelf ---- */
		const save = at(t, 1, 0.06, 0.2);
		const saved = this.saved.mesh;
		const slot = 2;
		const shelfAt = this.w.set(SHELF.x - 1.62 + slot * 1.08, 0.52 + 0.25 * Math.cos(LEAN), SHELF.z + 0.1 - 0.25 * Math.sin(LEAN));
		saved.visible = save > 0 && save < 1;
		this.shelfNotes[slot].mesh.visible = save >= 1;
		if (saved.visible) {
			// Off yesterday's last page, lying where it fell, and up onto the shelf.
			const from = this.v.set(slotX('a', slots('a') - 1), 0.5, RAIL_Z);
			this.arc(saved, from, shelfAt, inOut(save), 1.4);
			saved.rotation.set(-LEAN, 0, 0);
			saved.scale.setScalar(Math.min(1, save * 5));
		}
		// The index and the note the task needs go in as copies; the originals stay on the shelf.
		const load = [at(t, 1, 0.34, 0.46), at(t, 1, 0.44, 0.56)];
		this.loaded.forEach((card, k) => {
			const from = this.v.set(SHELF.x - 1.62 + k * 1.08, 0.52 + 0.25, SHELF.z + 0.1);
			const to = this.slotPoint('b', 1, this.w);
			const s = inOut(load[k]);
			card.mesh.visible = load[k] > 0 && load[k] < 1;
			if (!card.mesh.visible) return;
			this.arc(card.mesh, from, to, s, 1.2);
			card.mesh.rotation.set(-LEAN, 0, 0);
			// It shrinks into today's Notes page, which stands up as the copies arrive.
			card.mesh.scale.setScalar(Math.max(0.001, Math.min(1, load[k] * 5) * (1 - smooth(seg(load[k], 0.75, 1)))));
		});
		this.shelfLamps.forEach((lamp, i) => {
			// Only the index and the note today needs are lit, for as long as today's request carries them.
			const used = i < 2 ? smooth(seg(load[i], 0.85, 1)) : 0;
			lamp.mix('#ffffff', color.amber, used, 0.2 + used * 2);
		});

		/* ---- card 3: a copy of the file is kept first; then a push, and a change that breaks a test ---- */
		const broken = smooth(at(t, 2, 0.38, 0.44));
		const putBack = smooth(at(t, 4, 0.38, 0.46));
		// Each change flips the sheet over to the next: it narrows to an edge and opens on the new version.
		const flip = (k: number) => Math.abs(k - 0.5) * 2;
		const state = putBack > 0.5 ? 0 : broken > 0.5 ? 1 : 0;
		const turning = putBack > 0 ? putBack : broken;
		this.files.forEach((sheet, i) => {
			sheet.mesh.visible = i === state;
			sheet.mesh.scale.set(1, Math.max(0.02, flip(turning)), 1);
		});
		const fileLit = bell(t, 2.38, 2.5) + bell(t, 4.38, 4.52);
		this.fileLamp.mix('#ffffff', color.amber, Math.min(1, fileLit), 0.2 + Math.min(1, fileLit) * 2);

		const snap = at(t, 2, 0.04, 0.14);
		const snapBack = at(t, 4, 0.28, 0.38);
		const sm = this.snapshot.mesh;
		sm.visible = snap > 0 && snapBack < 1;
		if (sm.visible) {
			const from = this.v.set(FILES.x, 0.6, FILES.z - 0.2);
			const stand = this.w.set(SNAP.x, 0.1 + 0.33 * Math.cos(0.9), SNAP.z - 0.33 * Math.sin(0.9));
			if (snapBack <= 0) this.arc(sm, from, stand, inOut(snap), 0.5);
			else this.arc(sm, stand, from, inOut(snapBack), 0.5);
			sm.rotation.set(-0.9, 0, 0);
			sm.scale.setScalar(Math.max(0.001, 0.62 * Math.min(1, snap * 4) * (1 - smooth(seg(snapBack, 0.7, 1)))));
		}

		// The push: right after its page stands, a parcel leaves for the git host, and stays there.
		const push = at(t, 2, 0.22, 0.34);
		this.parcel.visible = push > 0;
		if (this.parcel.visible) {
			const from = this.slotPoint('b', 3, this.v);
			const to = this.w.set(HOST.x - 0.2, 1.74, HOST.z + 0.1);
			this.arc(this.parcel, from, to, inOut(push), 2.2);
			this.parcel.scale.setScalar(Math.max(0.001, Math.min(1, push * 5)));
		}
		const landed = bell(t, 2.32, 2.42);
		this.hostLamp.mix('#ffffff', '#22d36b', landed, 0.2 + landed * 2);

		/* ---- card 4: a fork copies today's conversation onto a rail of its own ---- */
		const forkRail = outBack(at(t, 3, 0.06, 0.16), 1.2);
		// It slides forward out of today's rail, rising from flat as it comes.
		this.forkRail.visible = forkRail > 0.001;
		this.forkRail.position.z = (RAIL_Z - FORK_Z) * (1 - Math.min(1, forkRail));
		this.forkRail.scale.set(1, Math.max(0.001, Math.min(1.1, forkRail)), 1);
		// Its name goes up once it's out, not squashed flat with it.
		this.railSigns.f.visible = forkRail > 0.98;
		const fLive = seg(t, 3.16, 3.2);
		this.lamps.f.mix('#9aa6b8', '#22d36b', fLive, 0.3 + fLive * 1.4);
		this.f.forEach((p, i) => {
			if (i < 3) {
				// The copied pages fly down from today's rail to the fork's, one after another.
				const k = at(t, 3, 0.18 + i * 0.06, 0.28 + i * 0.06);
				if (k <= 0) return this.stand(p.card, 'f', i, 0, 0);
				if (k < 1) {
					const mesh = p.card.mesh;
					mesh.visible = true;
					this.arc(mesh, this.slotPoint('b', i, this.v), this.slotPoint('f', i, this.w), inOut(k), 1.0);
					mesh.rotation.set(-LEAN, 0, 0);
					mesh.scale.setScalar(1);
					return;
				}
				return this.stand(p.card, 'f', i, 1, 1);
			}
			const up = outBack(at(t, 3, 0.5 + (i - 3) * 0.1, 0.56 + (i - 3) * 0.1), 1.3);
			this.stand(p.card, 'f', i, up, Math.min(1, up * 1.6));
		});

		/* ---- card 6: what no rewind can reach ---- */
		this.kept.scale.setScalar(Math.max(0.001, outBack(at(t, 5, 0.12, 0.2), 1.4)));
		this.notUndone.scale.setScalar(Math.max(0.001, outBack(at(t, 5, 0.3, 0.38), 1.4)));
		const glow = bell(t, 5.1, 5.4) + bell(t, 5.5, 5.8);
		if (glow > 0.01) this.hostLamp.mix('#ffffff', color.red, Math.min(1, glow), 0.2 + Math.min(1, glow) * 2);
	}
}
