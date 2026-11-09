import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { Card, machine, panel, shadowOn, stripes } from '../kit/machines';
import { Lamp, color, mats } from '../kit/materials';
import { bell, inOut, outBack, seg, smooth } from '../kit/math';
import { createSign, grown, SIGN_PHONE, signWidth } from '../kit/parts';
import { font, Surface } from '../kit/print';
import { createIsland } from '../props/island';
import { Cloudscape } from '../props/sky';
import type { HarnessId } from '../content';
import type { Shot } from '../rig';

/**
 * The side trip into plans and to-do lists: a stage of its own, high above the story, reached by dropping into the
 * laptop's screen, where the agent shows you its list. At the back runs the conversation, a page per message. On the
 * left your files, behind a barrier while the agent only plans. In front your desk, where the plan comes for you to
 * approve. On the right the checklist the model keeps for itself, and past it the tests, which say what's true.
 */
export const PLANS_AT = new THREE.Vector3(0, 1200, 0);
export const PLANS_SKY = { top: new THREE.Color('#9fd0f8'), mid: new THREE.Color('#c6e5fd'), low: new THREE.Color('#ecf7ff') };

/** Where you drop in: into the laptop's screen at home, in the story's coordinates. */
export const SCREEN_ROOF: Omit<Shot, 'T'> = {
	az: 15,
	el: 14,
	target: [-3.85, 1.2, -0.6],
	radius: 0.75,
	ry: 0.55,
	wide: { x: 0, y: 0, w: 1, h: 1 },
	tall: { x: 0, y: 0, w: 1, h: 1 }
};

/* ---------- the layout ---------- */

/** The conversation: a rail of pages along the back, one per message, as many as the trip needs. */
const RAIL_Z = -3.6;
const RAIL_X0 = -9.6;
const PITCH = 0.92;
const SLOTS = 13;
const slotX = (i: number) => RAIL_X0 + i * PITCH;
const PAGE_W = 0.8;
const PAGE_H = 0.6;
/** How far back a standing page leans, and where its bottom edge rests: on the rail, just above its groove. */
const LEAN = 0.16;
const PAGE_FOOT = 0.152;
/** Your files in their tray, and the barrier along its right side that holds changes back while the agent plans. */
const FILES = new THREE.Vector3(-7.0, 0, 0.8);
const TRAY_TOP = 0.2;
const BAR_X = -5.15;
const BAR_Z0 = 0.0;
const BAR_LEN = 1.6;
const BAR_Y = 0.78;
/** The sign that says which mode the agent is in, stood on the back edge of the tray, over the files. */
const MODE = new THREE.Vector3(-7.0, TRAY_TOP, 0.12);
const MODE_SIZE = 0.12;
/** The height of the flip sign's axle over the tray. */
const MODE_AXLE = 0.75;
/** Your desk, where the plan lands, the stamp's pad, and where the plan lies. */
const DESK = new THREE.Vector3(-2.6, 0, 2.0);
const DESK_W = 2.8;
const DESK_D = 1.3;
const DESK_TOP = 0.62;
const PAD = new THREE.Vector3(-1.5, 0, 2.3);
const PLAN_AT = new THREE.Vector3(-2.45, DESK_TOP + 0.012, 2.04);
/** Where on the plan the stamp comes down. */
const STAMP_AT = new THREE.Vector3(PLAN_AT.x + 0.1, 0, PLAN_AT.z + 0.2);
/** The checklist board, and its rows. */
const BOARD = new THREE.Vector3(4.9, 0, -0.2);
const BOARD_W = 4.2;
const BOARD_H = 3.4;
const BOARD_FOOT = 0.45;
const BOARD_TOP = BOARD_FOOT + BOARD_H;
const BOARD_FACE = BOARD.z + 0.08;
const ROW_PITCH = 0.44;
const rowY = (slot: number) => BOARD_TOP - 0.85 - slot * ROW_PITCH;
const BOX_X = BOARD.x - BOARD_W / 2 + 0.36;
/** The tests, which say what's true. */
const TESTS = new THREE.Vector3(10.3, 0, -0.6);

/** Where things happen, for the sound to come from. */
export const PLANS_SPOTS = {
	rail: (slot: number) => new THREE.Vector3(slotX(slot), 0.4, RAIL_Z),
	files: FILES,
	bar: new THREE.Vector3(BAR_X, BAR_Y, BAR_Z0 + BAR_LEN / 2),
	mode: MODE,
	desk: new THREE.Vector3(DESK.x, DESK_TOP, DESK.z),
	board: (slot: number) => new THREE.Vector3(BOX_X, rowY(slot), BOARD_FACE),
	tests: TESTS
};

const at = (t: number, card: number, a: number, b: number) => seg(t - card, a, b);

/* ---------- the camera, in the stage's own coordinates ---------- */

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);
const shot = (az: number, el: number, target: [number, number, number], radius: number, ry = radius * 0.6, extra: Partial<Shot> = {}): Omit<Shot, 'T'> => ({
	az,
	el,
	target: [target[0] + PLANS_AT.x, target[1] + PLANS_AT.y, target[2] + PLANS_AT.z],
	radius,
	ry,
	wide: WIDE,
	tall: TALL,
	...extra,
	// A phone's own subject is given in the stage's coordinates too.
	...(extra.tallTarget && {
		tallTarget: [extra.tallTarget[0] + PLANS_AT.x, extra.tallTarget[1] + PLANS_AT.y, extra.tallTarget[2] + PLANS_AT.z] as [number, number, number]
	})
});
const LOOK = shot(6, 24, [-6.2, 0.7, -0.6], 3.5, 2.2, { tallTarget: [-6.4, 0.7, -0.2], tallRadius: 3.0 });
const APPROVE = shot(-6, 30, [-4.0, 0.7, 1.2], 3.4, 2.0, { tallTarget: [-3.6, 0.7, 1.5], tallRadius: 2.6 });
const LIST = shot(-6, 10, [BOARD.x, 2.15, BOARD.z], 2.45, 2.1, { tallRadius: 2.4 });
const TICK = shot(8, 16, [3.0, 1.7, -1.4], 4.4, 2.5, { tallTarget: [BOARD.x - 0.3, 1.9, BOARD.z], tallRadius: 2.6 });
const PROMISE = shot(-10, 14, [7.35, 1.8, -0.4], 4.5, 2.0, { tallTarget: [7.4, 1.8, -0.4], tallRadius: 4.0 });
const CONVO = shot(0, 20, [-0.3, 0.45, -3.4], 2.5, 1.0, { tallTarget: [-0.3, 0.45, -3.4], tallRadius: 2.3 });
const ENDS = shot(-4, 20, [2.2, 1.5, -1.6], 5.0, 2.6, { tallTarget: [2.6, 1.6, -1.4], tallRadius: 4.4, tallRy: 3.0 });

export const PLANS_SHOTS: Shot[] = [
	{ T: 0, ...LOOK },
	{ T: 0.86, ...LOOK, az: 12 },
	{ T: 1.06, ...APPROVE },
	{ T: 1.9, ...APPROVE, az: 2 },
	{ T: 2.06, ...LIST },
	{ T: 2.9, ...LIST, az: 2 },
	{ T: 3.06, ...TICK },
	{ T: 3.9, ...TICK, az: 14 },
	{ T: 4.06, ...PROMISE },
	{ T: 4.9, ...PROMISE, az: -4 },
	{ T: 5.06, ...CONVO },
	{ T: 5.42, ...CONVO, az: 4 },
	{ T: 5.58, ...ENDS },
	{ T: 6, ...ENDS, az: 2 }
];

/* ---------- printed things ---------- */

type Kind = 'you' | 'model' | 'tool' | 'list' | 'summary';
const KIND: Record<Kind, { band: string; ink: string; label: string }> = {
	you: { band: color.ink, ink: '#ffffff', label: 'You' },
	model: { band: color.cobalt, ink: '#ffffff', label: 'Model' },
	tool: { band: '#12a956', ink: '#ffffff', label: 'Tool result' },
	list: { band: color.amber, ink: color.ink, label: 'List' },
	summary: { band: '#e9dcc0', ink: color.ink, label: 'Summary' }
};

/** One message in the conversation: who it's from on a coloured band, and what it says. */
function drawPage(card: Card, kind: Kind, text: string, label = KIND[kind].label) {
	const k = KIND[kind];
	card.draw((c, w, h) => {
		c.fillStyle = k.band;
		c.fillRect(0, 0, w, h * 0.27);
		c.fillStyle = k.ink;
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.15}px ${font.sans}`;
		c.fillText(label, w * 0.08, h * 0.14);
		c.fillStyle = color.ink;
		c.font = `600 ${h * 0.14}px ${font.mono}`;
		const room = w * 0.84;
		let line = '';
		let y = h * 0.48;
		for (const word of text.split(' ')) {
			const next = line ? `${line} ${word}` : word;
			if (c.measureText(next).width > room && line) {
				c.fillText(line, w * 0.08, y);
				line = word;
				y += h * 0.19;
			} else line = next;
		}
		c.fillText(line, w * 0.08, y);
	});
}

/** A file in the tray: its name, and a few lines of it. */
function fileSheet(name: string, lines: string[]) {
	const card = new Card(0.84, 0.64, 560, 0.01);
	card.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.fillRect(0, 0, w, h * 0.24);
		c.fillStyle = '#ffffff';
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.12}px ${font.mono}`;
		const width = c.measureText(name).width;
		if (width > w * 0.88) c.font = `700 ${(h * 0.12 * w * 0.88) / width}px ${font.mono}`;
		c.fillText(name, w * 0.06, h * 0.12);
		c.fillStyle = '#4d5a72';
		c.font = `500 ${h * 0.085}px ${font.mono}`;
		lines.forEach((line, i) => c.fillText(line, w * 0.06, h * (0.38 + i * 0.14)));
	});
	return card;
}

/** The plan, as the model writes it for you: numbered steps on one sheet. */
function planSheet(steps: string[]) {
	const card = new Card(1.3, 0.92, 520, 0.02);
	card.draw((c, w, h) => {
		c.fillStyle = color.cobalt;
		c.fillRect(0, 0, w, h * 0.18);
		c.fillStyle = '#ffffff';
		c.textBaseline = 'middle';
		c.font = `700 ${h * 0.1}px ${font.sans}`;
		c.fillText('The plan', w * 0.06, h * 0.095);
		c.fillStyle = color.ink;
		c.font = `600 ${h * 0.075}px ${font.sans}`;
		steps.forEach((s, i) => c.fillText(`${i + 1}. ${s}`, w * 0.06, h * (0.31 + i * 0.13)));
	});
	return card;
}

/** One line of the checklist: the step, in the model's own words. */
function rowCard(text: string) {
	const card = new Card(3.3, 0.36, 380, 0.004);
	card.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.textBaseline = 'middle';
		c.font = `600 ${h * 0.46}px ${font.sans}`;
		c.fillText(text, h * 0.3, h * 0.54);
	});
	return card;
}

/* ---------- the script ---------- */

/** The checklist, step by step. A step the model adds partway through goes in where it belongs. */
const STEPS = ['Find the scheduler code', 'Read the test file', 'Lock the queue', 'Add a two-worker test', 'Fix the deadlock', 'Run the whole suite'];
/** The step that isn't in the first list: it goes in once the tests fail. */
const ADDED = 4;

/** When each step goes from waiting to under way, and from under way to done, in the trip's own time. */
export const STARTS = [3.06, 3.24, 3.42, 3.62, 4.44, 4.76];
export const DONES = [3.22, 3.4, 3.6, 4.4, 4.72, Infinity];

/**
 * The conversation, page by page: what it is, what it says, and when it stands up. Where the agents differ, `alt` is
 * what Codex and Copilot do instead: asked to change nothing, they don't reach for an edit, and they ask you things.
 */
export const PAGES: { kind: Kind; text: string; t: number; alt?: { kind: Kind; text: string } }[] = [
	{ kind: 'you', text: 'Fix the race in the job scheduler', t: 0.08 },
	{ kind: 'model', text: 'Grep lock|schedule', t: 0.18 },
	{ kind: 'tool', text: '14 matching lines', t: 0.3 },
	{ kind: 'model', text: 'Edit scheduler.py', t: 0.46, alt: { kind: 'model', text: 'Keep the public API?' } },
	{ kind: 'tool', text: 'Blocked in plan mode', t: 0.66, alt: { kind: 'you', text: 'Yes, keep it' } },
	{ kind: 'model', text: 'Here is the plan', t: 1.08 },
	{ kind: 'list', text: 'Five steps', t: 2.1 },
	{ kind: 'model', text: 'Edit: take the lock', t: 3.46 },
	{ kind: 'list', text: 'Three done', t: 3.62 },
	{ kind: 'tool', text: '1 failed: a deadlock', t: 4.1 },
	{ kind: 'list', text: 'A step added', t: 4.28 },
	{ kind: 'tool', text: '12 passed', t: 4.62 },
	{ kind: 'list', text: 'Five of six done', t: 4.76 }
];
/** When the model sends its list, each time: the board lights as the harness draws it again. */
const LIST_AT = PAGES.filter((p) => p.kind === 'list').map((p) => p.t);
/** Everything before this page is folded into one summary when the conversation is compacted; the rest goes on as it is. */
const KEEP_FROM = 9;
/** The first page that lists the steps, which in Claude Code is made with a different tool from the updates after it. */
const FIRST_LIST = 6;

/** What each agent calls the parts that differ. */
const WORDS: Record<HarnessId, { plan: string; work: string; create: string; update: string; title: string; ends: string }> = {
	claude: { plan: 'Plan mode: read only', work: 'Plan approved', create: 'TaskCreate', update: 'TaskUpdate', title: 'Tasks', ends: 'A new session, a new list' },
	codex: { plan: 'Plan mode', work: 'Default mode', create: 'update_plan', update: 'update_plan', title: 'Plan', ends: 'A new session, no plan' },
	copilot: { plan: 'Plan agent: read only', work: 'Implementing the plan', create: '#todos', update: '#todos', title: 'Todos', ends: 'A new session, no list' }
};
const AGENTS: HarnessId[] = ['claude', 'codex', 'copilot'];

export class PlansStage {
	group = new THREE.Group();
	private clouds = new Cloudscape();
	private pages: Card[] = [];
	private summary: Card;
	private railLamp: Lamp;
	private sheets: Card[] = [];
	private sheetLamps: Lamp[] = [];
	private barArm: THREE.Group;
	private barLamp: Lamp;
	private refused: Card;
	private modeSigns: Record<HarnessId, { stand: THREE.Group; rotor: THREE.Group }>;
	private plan: Card;
	private stamp: THREE.Group;
	private approved: THREE.Mesh;
	private deskLamp: Lamp;
	private titles: Record<HarnessId, THREE.Group>;
	private boardLamp: Lamp;
	private rows: Card[] = [];
	private boxes: Lamp[] = [];
	private ticks: THREE.Group[] = [];
	private screen: Surface;
	private screenShown: string | null = null;
	private testLamp: Lamp;
	private ends: Record<HarnessId, THREE.Group>;
	private harness: HarnessId = 'claude';
	private v = new THREE.Vector3();
	private w = new THREE.Vector3();

	constructor() {
		const m = mats();
		const g = this.group;
		g.position.copy(PLANS_AT);
		g.visible = false;

		g.add(
			createIsland([
				[-11.6, 1.2],
				[-10.4, 3.8],
				[-2.0, 4.2],
				[8.0, 3.4],
				[12.2, 1.8],
				[12.6, -2.8],
				[10.0, -4.8],
				[-2, -5.2],
				[-10.6, -5.0],
				[-12.0, -2.2]
			])
		);

		/* -- the conversation, along the back -- */
		const x0 = slotX(0) - 0.66;
		const x1 = slotX(SLOTS - 1) + 0.62;
		const rail = new Batch();
		rail.add(rbox(x1 - x0, 0.12, 0.62, 0.04, 2), m.cream, { p: [(x0 + x1) / 2, 0.06, RAIL_Z] });
		rail.add(rbox(x1 - x0 - 0.1, 0.03, 0.12, 0.012, 1), m.recess, { p: [(x0 + x1) / 2, 0.125, RAIL_Z] });
		g.add(rail.build('conversation-rail'));
		shadowOn(g, (x0 + x1) / 2, 0, RAIL_Z, x1 - x0 + 0.3, 0.9, 0.3);
		this.railLamp = new Lamp(rbox(0.24, 0.12, 0.24, 0.05, 3), '#22d36b', 0.3);
		this.railLamp.mesh.position.set(x0 + 0.2, 0.18, RAIL_Z + 0.19);
		g.add(this.railLamp.mesh);
		const railSign = createSign('The conversation', 0.18);
		railSign.position.set(x0 + 1.5, 0.21 + grown(0.18), RAIL_Z + 0.39);
		g.add(railSign);
		for (const p of PAGES) {
			const card = new Card(PAGE_W, PAGE_H, 560, 0.02);
			drawPage(card, p.kind, p.text);
			card.mesh.visible = false;
			g.add(card.mesh);
			this.pages.push(card);
		}
		this.summary = new Card(PAGE_W, PAGE_H, 560, 0.02);
		drawPage(this.summary, 'summary', 'Everything before, in short');
		this.summary.mesh.visible = false;
		g.add(this.summary.mesh);

		/* -- your files, and the barrier that holds changes back -- */
		const tray = new Batch();
		tray.add(rbox(3.2, TRAY_TOP, 1.5, 0.06, 2), m.cream, { p: [FILES.x, TRAY_TOP / 2, FILES.z] });
		tray.add(rbox(3.0, 0.05, 1.3, 0.03, 2), m.creamDeep, { p: [FILES.x, TRAY_TOP + 0.01, FILES.z] });
		// The barrier's two posts, at either end of the tray's right side, each on a foot.
		for (const z of [BAR_Z0, BAR_Z0 + BAR_LEN]) {
			tray.add(rbox(0.14, BAR_Y + 0.08, 0.14, 0.04, 2), m.steelSoft, { p: [BAR_X, (BAR_Y + 0.08) / 2, z] });
			tray.add(rbox(0.26, 0.06, 0.26, 0.03, 2), m.steel, { p: [BAR_X, 0.03, z] });
		}
		g.add(tray.build('files-tray'));
		shadowOn(g, FILES.x, 0, FILES.z, 3.5, 1.8);
		const filesSign = createSign('Your files', 0.17);
		filesSign.position.set(FILES.x - 0.6, TRAY_TOP + grown(0.17) - 0.02, FILES.z + 0.79);
		g.add(filesSign);
		[
			['scheduler.py', ['class JobScheduler:', '  def run(self):', '    job = queue.pop()']],
			['test_scheduler.py', ['def test_runs_once():', '  s = JobScheduler()', '  s.run()']],
			['worker.py', ['def work(job):', '  job.start()', '  job.finish()']]
		].forEach(([name, lines], i) => {
			const sheet = fileSheet(name as string, lines as string[]);
			this.sheets.push(sheet);
			g.add(sheet.mesh);
			const lamp = new Lamp(new THREE.SphereGeometry(0.05, 12, 8), '#ffffff', 0.2);
			lamp.mesh.position.set(FILES.x - 1.0 + i * 1.0, TRAY_TOP + 0.06, FILES.z + 0.5);
			g.add(lamp.mesh);
			this.sheetLamps.push(lamp);
		});
		this.barArm = new THREE.Group();
		const arm = new THREE.Mesh(rbox(0.08, 0.1, BAR_LEN, 0.03, 2), stripes('#f0473c', '#fbfaf5', 3));
		arm.position.z = BAR_LEN / 2;
		arm.castShadow = true;
		this.barArm.add(arm);
		// It pivots on top of the back post, and in its rest on top of the front one.
		this.barArm.position.set(BAR_X, BAR_Y + 0.13, BAR_Z0);
		g.add(this.barArm);
		this.barLamp = new Lamp(rbox(0.16, 0.08, 0.16, 0.03, 3), '#ffffff', 0.2);
		this.barLamp.mesh.rotation.x = Math.PI / 2;
		this.barLamp.mesh.position.set(BAR_X, BAR_Y - 0.12, BAR_Z0 + BAR_LEN + 0.07 + 0.04);
		g.add(this.barLamp.mesh);
		// The edit Claude reaches for while it's meant to be planning, which the barrier turns back.
		this.refused = new Card(PAGE_W, PAGE_H, 560, 0.02);
		drawPage(this.refused, 'model', 'Edit scheduler.py', 'Tool call');
		this.refused.mesh.visible = false;
		g.add(this.refused.mesh);

		/* -- which mode the agent is in, over the files -- */
		// A flip sign: two plates back to back on an axle, turning over in a bracket on a post. Planning on the front,
		// working on the back, upside down until it turns.
		const modeSign = (plan: string, work: string) => {
			const stand = new THREE.Group();
			stand.position.set(MODE.x, MODE.y + MODE_AXLE, MODE.z);
			const rotor = new THREE.Group();
			const front = createSign(plan, MODE_SIZE, '#ffffff', m.cobalt);
			front.position.z = 0.042;
			const back = createSign(work, MODE_SIZE, color.ink, m.creamLight);
			back.position.z = -0.042;
			back.rotation.x = Math.PI;
			rotor.add(front, back);
			const w = Math.max(signWidth(front), signWidth(back));
			const half = MODE_SIZE * SIGN_PHONE;
			// The axle runs between the plates and ends at the bracket's arms; the plates' corners sweep this far as they turn.
			const reach = Math.hypot(half, 0.082) + 0.04;
			const arm = w / 2 + 0.07;
			const axle = new Batch();
			axle.add(new THREE.CylinderGeometry(0.018, 0.018, (arm - 0.025) * 2, 12), m.steel, { r: [0, 0, Math.PI / 2] });
			rotor.add(axle.build('mode-axle'));
			stand.add(rotor);
			const frame = new Batch();
			for (const x of [-arm, arm]) frame.add(rbox(0.05, reach + 0.1, 0.06, 0.02, 2), m.steelSoft, { p: [x, -(reach + 0.1) / 2 + 0.05, 0] });
			frame.add(rbox(arm * 2 + 0.05, 0.05, 0.06, 0.02, 2), m.steelSoft, { p: [0, -reach - 0.05 + 0.025, 0] });
			// The post, from under the bracket down into the tray.
			const post = MODE_AXLE - reach - 0.05 + 0.01;
			frame.add(rbox(0.07, post + 0.02, 0.07, 0.02, 2), m.steelSoft, { p: [0, -reach - 0.05 - post / 2 + 0.01, 0] });
			stand.add(frame.build('mode-bracket'));
			g.add(stand);
			return { stand, rotor };
		};
		this.modeSigns = Object.fromEntries(AGENTS.map((id) => [id, modeSign(WORDS[id].plan, WORDS[id].work)])) as typeof this.modeSigns;

		/* -- your desk, where the plan comes for approval -- */
		const desk = new Batch();
		desk.add(rbox(DESK_W, 0.1, DESK_D, 0.04, 2), m.cream, { p: [DESK.x, DESK_TOP - 0.05, DESK.z] });
		for (const dx of [-DESK_W / 2 + 0.1, DESK_W / 2 - 0.1])
			for (const dz of [-DESK_D / 2 + 0.1, DESK_D / 2 - 0.1])
				desk.add(rbox(0.1, DESK_TOP - 0.1, 0.1, 0.03, 2), m.steelSoft, { p: [DESK.x + dx, (DESK_TOP - 0.1) / 2, DESK.z + dz] });
		// The stamp's pad, at the right of the desk.
		desk.add(rbox(0.42, 0.06, 0.34, 0.02, 2), m.slate, { p: [PAD.x, DESK_TOP + 0.03, PAD.z] });
		g.add(desk.build('your-desk'));
		shadowOn(g, DESK.x, 0, DESK.z, DESK_W + 0.3, DESK_D + 0.3);
		// Hung from the front edge of the desk top.
		const youSign = createSign('You', 0.17, undefined, undefined, true);
		youSign.position.set(DESK.x - 0.8, DESK_TOP - 0.1 - 0.17, DESK.z + DESK_D / 2 + 0.01);
		g.add(youSign);
		this.deskLamp = new Lamp(rbox(0.2, 0.08, 0.2, 0.04, 3), '#ffffff', 0.2);
		this.deskLamp.mesh.position.set(DESK.x - 1.1, DESK_TOP + 0.04, DESK.z - 0.4);
		g.add(this.deskLamp.mesh);
		this.plan = planSheet(STEPS.filter((_, i) => i !== ADDED));
		this.plan.mesh.visible = false;
		g.add(this.plan.mesh);
		this.stamp = new THREE.Group();
		const stamp = new Batch();
		stamp.add(rbox(0.36, 0.1, 0.28, 0.03, 2), m.greenGlow, { p: [0, 0.05, 0] });
		stamp.add(rbox(0.3, 0.06, 0.22, 0.02, 2), m.steel, { p: [0, 0.13, 0] });
		stamp.add(new THREE.CylinderGeometry(0.05, 0.06, 0.24, 16), m.steelSoft, { p: [0, 0.28, 0] });
		stamp.add(new THREE.SphereGeometry(0.1, 16, 12), m.red, { p: [0, 0.44, 0] });
		this.stamp.add(stamp.build('stamp'));
		g.add(this.stamp);
		// What the stamp leaves: printed flat on the plan, where it pressed.
		const ink = new Surface(360, 110);
		ink.draw((c, w, h) => {
			c.strokeStyle = '#12a956';
			c.lineWidth = h * 0.08;
			c.beginPath();
			c.roundRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.88, h * 0.2);
			c.stroke();
			c.fillStyle = '#12a956';
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.font = `800 ${h * 0.52}px ${font.sans}`;
			c.fillText('APPROVED', w / 2, h * 0.54);
		});
		this.approved = new THREE.Mesh(
			new THREE.PlaneGeometry(0.46, 0.14),
			new THREE.MeshStandardMaterial({ map: ink.texture, transparent: true, roughness: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })
		);
		this.approved.position.set(STAMP_AT.x, PLAN_AT.y + 0.004, STAMP_AT.z);
		this.approved.rotation.set(-Math.PI / 2, 0, 0.1);
		this.approved.visible = false;
		g.add(this.approved);

		/* -- the checklist board -- */
		const board = new Batch();
		board.add(rbox(BOARD_W, BOARD_H, 0.16, 0.08, 3), m.porcelain, { p: [BOARD.x, BOARD_FOOT + BOARD_H / 2, BOARD.z] });
		board.add(rbox(BOARD_W - 0.12, 0.6, 0.04, 0.03, 2), m.creamLight, { p: [BOARD.x, BOARD_TOP - 0.36, BOARD.z + 0.08] });
		for (const dx of [-BOARD_W / 2 + 0.4, BOARD_W / 2 - 0.4]) {
			board.add(rbox(0.12, BOARD_FOOT + 0.1, 0.12, 0.03, 2), m.steelSoft, { p: [BOARD.x + dx, (BOARD_FOOT + 0.1) / 2, BOARD.z] });
			board.add(rbox(0.3, 0.06, 0.9, 0.03, 2), m.steel, { p: [BOARD.x + dx, 0.03, BOARD.z] });
		}
		g.add(board.build('checklist-board'));
		shadowOn(g, BOARD.x, 0, BOARD.z, BOARD_W + 0.4, 1.3);
		const title = (text: string) => {
			const s = createSign(text, 0.19, color.ink, m.creamLight, true);
			// Left-aligned in the board's header.
			s.position.set(BOARD.x - BOARD_W / 2 + 0.3 + signWidth(s) / 2, BOARD_TOP - 0.36, BOARD.z + 0.14);
			g.add(s);
			return s;
		};
		this.titles = { claude: title(WORDS.claude.title), codex: title(WORDS.codex.title), copilot: title(WORDS.copilot.title) };
		// It lights each time the harness draws the list again, from the model's latest call.
		this.boardLamp = new Lamp(new THREE.SphereGeometry(0.09, 16, 12), '#ffffff', 0.2);
		this.boardLamp.mesh.position.set(BOARD.x + BOARD_W / 2 - 0.34, BOARD_TOP - 0.36, BOARD.z + 0.12);
		g.add(this.boardLamp.mesh);
		const tickMat = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 });
		STEPS.forEach((text) => {
			const row = rowCard(text);
			row.mesh.visible = false;
			g.add(row.mesh);
			this.rows.push(row);
			const lamp = new Lamp(rbox(0.28, 0.28, 0.07, 0.05, 3), '#ffffff', 0.2);
			lamp.mesh.visible = false;
			g.add(lamp.mesh);
			this.boxes.push(lamp);
			// A tick: a short stroke and a long one, standing proud of the box.
			const tick = new THREE.Group();
			const short = new THREE.Mesh(rbox(0.05, 0.11, 0.03, 0.012, 1), tickMat);
			short.position.set(-0.05, -0.02, 0);
			short.rotation.z = 0.75;
			const long = new THREE.Mesh(rbox(0.05, 0.22, 0.03, 0.012, 1), tickMat);
			long.position.set(0.04, 0.03, 0);
			long.rotation.z = -0.62;
			tick.add(short, long);
			tick.visible = false;
			g.add(tick);
			this.ticks.push(tick);
		});

		/* -- the tests -- */
		const tests = machine({ w: 1.7, h: 1.7, d: 1.1, name: 'Tests' });
		tests.position.copy(TESTS);
		g.add(tests);
		shadowOn(g, TESTS.x, 0, TESTS.z, 2.1, 1.5);
		this.screen = new Surface(560, 300);
		const face = panel(1.3, 0.62, this.screen, 1);
		face.position.set(TESTS.x, 0.14 + 0.6, TESTS.z + 0.56);
		g.add(face);
		this.testLamp = new Lamp(rbox(0.26, 0.1, 0.26, 0.04, 3), '#ffffff', 0.2);
		this.testLamp.mesh.position.set(TESTS.x + 0.55, 1.89, TESTS.z + 0.2);
		g.add(this.testLamp.mesh);
		this.drawScreen('');

		/* -- what's left when the session ends: sat on the top edge of the board, rising from it -- */
		const end = (text: string) => {
			const holder = new THREE.Group();
			const s = createSign(text, 0.18, '#ffffff', m.slate);
			s.position.y = 0.18 + grown(0.18);
			holder.add(s);
			holder.position.set(BOARD.x, BOARD_TOP, BOARD.z);
			holder.scale.setScalar(0.001);
			g.add(holder);
			return holder;
		};
		this.ends = { claude: end(WORDS.claude.ends), codex: end(WORDS.codex.ends), copilot: end(WORDS.copilot.ends) };

		this.clouds.lay([{ shots: PLANS_SHOTS, sky: () => true }], 22);
		g.add(this.clouds.group);
		this.setHarness('claude');
	}

	setHarness(id: HarnessId) {
		this.harness = id;
		const words = WORDS[id];
		for (const [key, sign] of Object.entries(this.titles)) sign.visible = key === id;
		PAGES.forEach((p, i) => {
			// The list's own pages carry the name of the tool that wrote them.
			if (p.kind === 'list') drawPage(this.pages[i], 'list', p.text, i === FIRST_LIST ? words.create : words.update);
			else if (p.alt) {
				const page = id === 'claude' ? p : p.alt;
				drawPage(this.pages[i], page.kind, page.text);
			}
		});
	}

	private drawScreen(text: string) {
		if (text === this.screenShown) return;
		this.screenShown = text;
		const failed = text.includes('failed');
		this.screen.draw((c, w, h) => {
			c.fillStyle = '#0d1b33';
			c.fillRect(0, 0, w, h);
			c.textBaseline = 'middle';
			c.fillStyle = '#7f8fa8';
			c.font = `600 ${h * 0.12}px ${font.mono}`;
			c.fillText('pytest -x', w * 0.07, h * 0.2);
			c.fillStyle = failed ? '#ff6b5e' : '#3fe583';
			c.font = `700 ${h * 0.2}px ${font.mono}`;
			c.fillText(text || '–', w * 0.07, h * 0.58);
		});
	}

	/** A page standing on the rail, hinged at its bottom edge: 0 lying flat, 1 standing and leaning back a little. */
	private stand(card: Card, up: number, size: number, x: number) {
		const mesh = card.mesh;
		mesh.visible = size > 0.001;
		if (!mesh.visible) return;
		const angle = -(LEAN + (1 - Math.min(up, 1.1)) * (Math.PI / 2 - LEAN));
		const half = (PAGE_H * size) / 2;
		mesh.position.set(x, PAGE_FOOT + half * Math.cos(angle), RAIL_Z + half * Math.sin(angle));
		mesh.rotation.set(angle, 0, 0);
		mesh.scale.setScalar(Math.max(0.001, size));
	}

	/** Something flying in an arc from a to b, s from 0 to 1. */
	private arc(mesh: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, s: number, lift: number) {
		mesh.position.lerpVectors(a, b, s);
		mesh.position.y += Math.sin(Math.PI * s) * lift;
	}

	/** Where a page stands on the rail, for flying things to and from. */
	private slotPoint(slot: number, out: THREE.Vector3) {
		return out.set(slotX(slot), PAGE_FOOT + (PAGE_H / 2) * Math.cos(LEAN), RAIL_Z - (PAGE_H / 2) * Math.sin(LEAN));
	}

	/** t: the trip's own time, one unit per card. */
	update(t: number, time: number) {
		this.clouds.update(time);
		const claude = this.harness === 'claude';

		/* ---- card 6: the conversation is compacted, then the session ends ---- */
		const fold = inOut(at(t, 5, 0.1, 0.3));
		const ended = inOut(at(t, 5, 0.58, 0.68));

		/* ---- the conversation, page by page, all the way through ---- */
		PAGES.forEach((p, i) => {
			const up = outBack(seg(t, p.t, p.t + 0.06), 1.3);
			const card = this.pages[i];
			if (i < KEEP_FROM) {
				// Folded away: the nearest first, each page slides along to the last of them, shrinking into the summary.
				const late = (KEEP_FROM - 1 - i) / KEEP_FROM;
				const into = smooth(seg(fold, late * 0.5, 0.5 + late * 0.5 - 0.1));
				return this.stand(card, up, Math.min(1, up * 1.6) * (1 - into), slotX(i) + (slotX(KEEP_FROM - 1) - slotX(i)) * into);
			}
			// The latest turns go on as they are; then the session ends and they lie down.
			this.stand(card, up * (1 - ended), Math.min(1, up * 1.6), slotX(i));
		});
		// The summary stands where the folded pages ended, right before the turns that were kept.
		const sum = outBack(seg(fold, 0.55, 0.72), 1.3);
		this.stand(this.summary, sum * (1 - ended), Math.min(1, sum * 1.6), slotX(KEEP_FROM - 1));
		const live = seg(t, 0.04, 0.08) * (1 - ended);
		this.railLamp.mix('#9aa6b8', '#22d36b', live, 0.3 + live * 1.4);

		/* ---- card 1: planning. Files are read; changes wait behind the barrier ---- */
		const read = [bell(t, 0.22, 0.34), bell(t, 0.26, 0.38), bell(t, 0.3, 0.42)];
		this.sheets.forEach((sheet, i) => {
			// A file being read lifts a little in its slot, then settles.
			const lift = smooth(Math.min(1, read[i] * 1.6));
			sheet.mesh.position.set(FILES.x - 1.0 + i * 1.0, TRAY_TOP + 0.04 + 0.32 * Math.cos(0.42) + lift * 0.1, FILES.z + 0.05 - 0.32 * Math.sin(0.42));
			sheet.mesh.rotation.set(-0.42 + lift * 0.12, 0, 0);
			this.sheetLamps[i].mix('#ffffff', '#22d36b', Math.min(1, read[i] * 1.4), 0.2 + Math.min(1, read[i] * 1.4) * 2);
		});
		// Claude's edit: out of the conversation, over to the barrier, which it can't pass, and back down.
		const go = at(t, 0, 0.5, 0.6);
		const back = at(t, 0, 0.62, 0.7);
		const rm = this.refused.mesh;
		rm.visible = claude && go > 0 && back < 1;
		if (rm.visible) {
			const from = this.slotPoint(3, this.v);
			const stop = this.w.set(BAR_X + 0.62, BAR_Y + 0.06, BAR_Z0 + BAR_LEN / 2);
			if (back <= 0) {
				// Across first, high over the barrier's arm, then down beside it.
				const s = inOut(go);
				const across = smooth(Math.min(1, s / 0.7));
				rm.position.set(from.x + (stop.x - from.x) * across, from.y + (stop.y - from.y) * s + Math.sin(Math.PI * s) * 1.3, from.z + (stop.z - from.z) * across);
			} else rm.position.copy(stop).add(this.v.set(0.3 * back, -0.25 * back * back, 0));
			rm.rotation.set(0, -0.35 * smooth(seg(go, 0.6, 1)), 0);
			rm.scale.setScalar(Math.max(0.001, Math.min(1, go * 5) * (1 - smooth(back))));
		}
		const turned = claude ? Math.min(1, bell(t, 0.6, 0.72) * 1.5) : 0;

		/* ---- card 2: the plan comes to you; approved, the barrier lifts and the mode changes ---- */
		const approve = smooth(at(t, 1, 0.52, 0.58));
		const open = inOut(at(t, 1, 0.66, 0.8));
		// Red while it holds, and green once it opens.
		if (turned > 0.01) this.barLamp.mix('#ffffff', color.red, turned, 0.2 + turned * 2);
		else this.barLamp.mix(color.red, '#22d36b', open, 0.5 + open * 1.5);
		this.barArm.rotation.x = -1.4 * open;
		const swap = at(t, 1, 0.7, 0.82);
		for (const [id, sign] of Object.entries(this.modeSigns)) {
			sign.stand.visible = id === this.harness;
			// It turns over on its axle, top towards you.
			sign.rotor.rotation.x = Math.PI * inOut(swap);
		}

		const send = at(t, 1, 0.14, 0.34);
		const pm = this.plan.mesh;
		pm.visible = send > 0;
		if (pm.visible) {
			// From the model's page in the conversation, high over the barrier and the files' sign, down onto your desk,
			// tipping over to lie flat as it comes, with its lower edge always above the desk.
			const from = this.slotPoint(5, this.v);
			this.arc(pm, from, PLAN_AT, inOut(send), 2.0);
			const lie = smooth(seg(send, 0.5, 0.92));
			const angle = LEAN + lie * (Math.PI / 2 - LEAN);
			pm.rotation.set(-angle, 0, 0);
			const size = Math.min(1, send * 5);
			pm.position.y += (0.46 * size + 0.03) * Math.cos(angle);
			pm.scale.setScalar(Math.max(0.001, size));
		}
		// The stamp: off its pad, across onto the plan, down, and back.
		const reach = at(t, 1, 0.38, 0.5);
		const home = at(t, 1, 0.58, 0.68);
		const pad = this.v.set(PAD.x, DESK_TOP + 0.06, PAD.z);
		// Held a little above the plan, then pressed down onto it and lifted.
		const over = this.w.set(STAMP_AT.x, PLAN_AT.y + 0.006 + 0.12, STAMP_AT.z);
		if (home > 0) this.arc(this.stamp, over, pad, inOut(home), 0.3);
		else this.arc(this.stamp, pad, over, inOut(reach), 0.3);
		if (reach >= 1 && home <= 0) this.stamp.position.y -= 0.12 * bell(t, 1.5, 1.58);
		this.approved.visible = t >= 1.54;
		this.deskLamp.mix('#ffffff', '#22d36b', approve, 0.2 + approve * 2);

		/* ---- card 3: the model writes itself a list, and the harness shows it on the board ---- */
		/* ---- cards 4 and 5: it ticks the steps off, adds one when the tests fail, and the tests say what's true ---- */
		const added = smooth(at(t, 4, 0.24, 0.34));
		const clear = smooth(ended);
		let redraw = 0;
		for (const at of LIST_AT) redraw = Math.max(redraw, bell(t, at, at + 0.12));
		const glow = Math.min(1, redraw * 1.4) * (1 - clear);
		this.boardLamp.mix('#ffffff', color.amber, glow, 0.2 + glow * 2);
		STEPS.forEach((_, i) => {
			const row = this.rows[i].mesh;
			const lamp = this.boxes[i];
			const tick = this.ticks[i];
			// The first list has five steps; the one it lacks goes in later, and the last step moves down to make room.
			const slot = i < ADDED ? i : i === ADDED ? ADDED : ADDED + added;
			const shown = i === ADDED ? outBack(at(t, 4, 0.28, 0.36), 1.3) : outBack(at(t, 2, 0.2 + Math.min(i, ADDED) * 0.08, 0.26 + Math.min(i, ADDED) * 0.08), 1.3);
			const k = Math.max(0, shown * (1 - clear));
			row.visible = lamp.mesh.visible = k > 0.002;
			tick.visible = false;
			if (!row.visible) return;
			const y = rowY(slot);
			row.position.set(BOARD.x + 0.25, y, BOARD_FACE + 0.012);
			row.scale.set(1, Math.max(0.001, k), 1);
			lamp.mesh.position.set(BOX_X, y, BOARD_FACE + 0.035);
			lamp.mesh.scale.setScalar(Math.max(0.001, Math.min(1, k)));
			const started = smooth(seg(t, STARTS[i], STARTS[i] + 0.04));
			const done = smooth(seg(t, DONES[i], DONES[i] + 0.04));
			// Waiting is a plain box, under way is amber, done is green with a tick.
			if (done > 0) lamp.mix(color.amber, '#22d36b', done, 1.0 + done * 0.4);
			else lamp.mix('#e8ecf2', color.amber, started, 0.25 + started * (0.75 + 0.25 * Math.sin(time * 5)));
			tick.visible = done > 0.002;
			tick.position.set(BOX_X, y, BOARD_FACE + 0.085);
			tick.scale.setScalar(Math.max(0.001, outBack(seg(t, DONES[i], DONES[i] + 0.06), 2) * k));
		});

		/* ---- the tests: nothing yet, then one failure, then a pass ---- */
		const result = t >= 4.62 ? '12 passed' : t >= 4.12 ? '1 failed' : '';
		this.drawScreen(result);
		if (result === '1 failed') this.testLamp.mix('#ffffff', color.red, 1, 0.2 + (0.4 + bell(t, 4.1, 4.3) * 0.6) * 2);
		else this.testLamp.mix('#ffffff', '#22d36b', result ? 1 : 0, 0.2 + (result ? 0.4 + bell(t, 4.6, 4.8) * 0.6 : 0) * 2);

		/* ---- the end of the session: the next one starts without this list ---- */
		const endUp = Math.max(0.001, outBack(at(t, 5, 0.72, 0.82), 1.4));
		for (const [id, sign] of Object.entries(this.ends)) {
			sign.visible = id === this.harness;
			sign.scale.setScalar(endUp);
		}
	}
}
