import * as THREE from 'three';
import { Card } from '../kit/machines';
import { color } from '../kit/materials';
import { bell, inOut, lerp, outBack, seg, smooth } from '../kit/math';
import { font } from '../kit/print';
import type { Harness } from '../props/harness';
import type { McpServer } from '../props/mcp';
import type { Shot } from '../rig';

/** What the main story has the harness doing, so the side trip can take over from it without a jump. */
export interface HarnessPose {
	opens: number[];
	filled: number[];
	wake: number;
}

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const WIDE = box(0.4, 0.1, 0.58, 0.8);
const TALL = box(0.02, 0.08, 0.96, 0.44);

/** The whole island: the harness on the left, the cable along the back, the server on the right. */
const ISLAND: Omit<Shot, 'T'> = { az: 12, el: 22, target: [4.2, 0.75, -0.55], radius: 3.95, ry: 1.7, wide: WIDE, tall: TALL, tallRadius: 4.1, tallRy: 2.0 };
const SERVER: Omit<Shot, 'T'> = { az: 12, el: 38, target: [7.18, 0.8, 0.06], radius: 0.66, ry: 0.52, wide: WIDE, tall: TALL };
const CABLE: Omit<Shot, 'T'> = { az: 18, el: 30, target: [4.6, 0.35, -1.25], radius: 2.7, ry: 1.3, wide: WIDE, tall: TALL };
const TOOLS_DRAWER: Omit<Shot, 'T'> = { az: 10, el: 34, target: [1.1, 1.4, 1.08], radius: 1.08, ry: 0.8, wide: WIDE, tall: TALL };
const TALK_DRAWER: Omit<Shot, 'T'> = { az: 10, el: 34, target: [1.1, 0.8, 1.08], radius: 1.08, ry: 0.8, wide: WIDE, tall: TALL };
/** One of the server's drawers, open, at the height it sits. */
const TRAY = (y: number): Omit<Shot, 'T'> => ({ az: 12, el: 36, target: [7.18, Math.max(0.62, y + 0.14), 0.1], radius: 0.62, ry: 0.5, wide: WIDE, tall: TALL });

/** The camera through the side trip, by card: each card is one unit of the track's own story time. */
export const MCP_SHOTS: Shot[] = [
	{ T: 0, ...ISLAND },
	{ T: 0.85, ...ISLAND, az: 16 },
	{ T: 1.1, ...SERVER },
	{ T: 1.5, ...SERVER, az: 14 },
	{ T: 1.62, ...CABLE },
	{ T: 1.76, ...TOOLS_DRAWER },
	{ T: 2.0, ...TOOLS_DRAWER, az: 11 },
	{ T: 2.14, ...ISLAND },
	{ T: 2.38, ...ISLAND, az: 16 },
	{ T: 2.5, ...SERVER },
	{ T: 3.28, ...SERVER, az: 14 },
	{ T: 3.44, ...CABLE },
	{ T: 3.6, ...TALK_DRAWER },
	{ T: 4.0, ...TALK_DRAWER, az: 11 },
	{ T: 4.14, ...TRAY(0.66) },
	{ T: 4.38, ...TRAY(0.66), az: 15 },
	{ T: 4.5, ...TRAY(0.5) },
	{ T: 4.66, ...TRAY(0.5), az: 15 },
	{ T: 4.78, ...TRAY(0.34) },
	{ T: 5, ...TRAY(0.34), az: 16 }
];

/** Where each card's story plays, inside its unit of track time. Before and after, the words have the screen. */
const at = (t: number, card: number, a: number, b: number) => seg(t - card, a, b);
/** A message's paper, and how far back one leans once it's standing. */
const CARD_W = 0.4;
const CARD_H = 0.26;
const LEAN = 0.18;
/** A message's size in the server's small drawer, and in the harness's big ones. */
const SMALL = 1.15;
const BIG = 2.2;
/** The last card opens the server's drawers one at a time: when each comes out, stands what's in it, and goes back. */
const SHOW = [
	[0.12, 0.2, 0.36, 0.44],
	[0.42, 0.5, 0.64, 0.72],
	[0.7, 0.78, 8, 9]
];
const KEEP_H = 0.14;

function message(head: string, accent: string, lines: [string, string][]) {
	const card = new Card(CARD_W, CARD_H, 900, 0.01);
	card.draw((c, w, h) => {
		c.fillStyle = accent;
		c.fillRect(0, 0, w, h * 0.22);
		c.fillStyle = accent === color.amber ? color.ink : '#ffffff';
		c.font = `700 ${h * 0.12}px ${font.sans}`;
		c.textBaseline = 'middle';
		c.fillText(head, w * 0.06, h * 0.115);
		c.textBaseline = 'alphabetic';
		let y = h * 0.4;
		for (const [strong, soft] of lines) {
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.115}px ${font.mono}`;
			c.fillText(strong, w * 0.06, y);
			y += h * 0.14;
			if (soft) {
				c.fillStyle = '#4d5a72';
				c.font = `500 ${h * 0.095}px ${font.sans}`;
				c.fillText(soft, w * 0.06, y);
				y += h * 0.16;
			}
		}
	});
	return card;
}

/** Something the server keeps, lying in one of its drawers. It never leaves: what travels is a description of it. */
function keep(name: string) {
	const card = new Card(0.32, KEEP_H, 800, 0.01);
	card.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.font = `700 ${h * 0.3}px ${font.mono}`;
		c.textBaseline = 'middle';
		c.fillText(name, w * 0.08, h * 0.52);
	});
	card.mesh.rotation.x = -Math.PI / 2;
	return card.mesh;
}

/**
 * The side trip into MCP. It borrows the island's own harness, cable and server, and adds what travels between
 * them: the list of tools, a call and its answer. Everything is a pure function of the track's time.
 */
export class McpTrack {
	group = new THREE.Group();
	shown = false;
	private slug: THREE.Mesh;
	private slugMat: THREE.MeshPhysicalMaterial;
	private list = message('Tool list', color.cobalt, [
		['search_docs(query)', 'Searches the library’s docs.'],
		['get_page(path)', 'Reads one page.']
	]);
	private call = message('Tool call', color.amber, [['search_docs', ''], ['{ "query": "locking" }', 'Checked by the harness.']]);
	private answer = message('Result', color.green, [['3 blocks of text', 'Locks, RLock, and an example.']]);
	private port = new THREE.Vector3();
	private hinge = new THREE.Vector3();
	private v = new THREE.Vector3();
	private w = new THREE.Vector3();
	private up = new THREE.Vector3(0, 1, 0);
	private outs = [0, 0, 0];
	private kept: { mesh: THREE.Object3D; d: number; x: number }[] = [];

	constructor(
		private harness: Harness,
		private server: McpServer,
		/** The server's lead, from the server's port (0) to the harness's flank (1). */
		private lead: THREE.Curve<THREE.Vector3>
	) {
		this.slugMat = new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.25, clearcoat: 1, emissive: '#7fb8ff', emissiveIntensity: 1.6 });
		this.slug = new THREE.Mesh(new THREE.CapsuleGeometry(0.074, 0.2, 6, 14), this.slugMat);
		this.slug.castShadow = true;
		this.group.add(this.slug);
		for (const card of [this.list, this.call, this.answer]) this.group.add(card.mesh);
		// What each drawer keeps, behind where a message stands, for the last card, which opens all three.
		[['search_docs', 'get_page'], ['locking.md', 'api.md'], ['/explain']].forEach((items, d) => {
			items.forEach((name, i) => {
				const mesh = keep(name);
				server.drawers[d].group.add(mesh);
				this.kept.push({ mesh, d, x: items.length === 1 ? 0 : (i - 0.5) * 0.35 });
			});
		});
		lead.getPointAt(0, this.port);
		this.group.visible = false;
	}

	/** A message in the cable: s runs from 0 at the server to 1 at the harness. */
	private slugAt(s: number, tint: string, glow: string) {
		const u = Math.min(0.995, Math.max(0.005, s));
		this.lead.getPointAt(u, this.slug.position);
		this.slug.quaternion.setFromUnitVectors(this.up, this.lead.getTangentAt(u, this.v));
		// Lying along the floor, the cable is at the island's surface, so the swelling rides on top of it.
		this.slug.position.y += Math.max(0, 0.076 - this.slug.position.y);
		this.slugMat.color.set(tint);
		this.slugMat.emissive.set(glow);
	}

	/**
	 * Stands a card in a tray, hinged at its bottom edge like the drawer sheets in the story: 0 lying back in the tray,
	 * 1 standing, leaning back a little. A spring's overshoot brings it up to plumb and no further.
	 */
	private stand(mesh: THREE.Object3D, hinge: THREE.Vector3, up: number, scale: number) {
		const angle = -(LEAN + (1 - Math.min(up, 1.1)) * (Math.PI / 2 - LEAN));
		const half = (CARD_H * scale) / 2;
		mesh.position.set(hinge.x, hinge.y + 0.012 + half * Math.cos(angle), hinge.z + half * Math.sin(angle));
		mesh.rotation.set(angle, 0, 0);
		mesh.scale.setScalar(Math.max(0.001, scale));
	}

	/**
	 * Out of the server's Tools drawer, up round the server's front corner and into its port, shrinking to nothing as it
	 * goes in. k: 0 standing in the tray, 1 inside the fitting.
	 */
	private toPort(mesh: THREE.Object3D, hinge: THREE.Vector3, k: number) {
		const e = inOut(k);
		const half = (CARD_H * SMALL) / 2;
		const a = this.v.set(hinge.x, hinge.y + half * Math.cos(LEAN), hinge.z - half * Math.sin(LEAN));
		const c = this.w.set(5.9, 1.65, 0.05);
		const u = 1 - e;
		mesh.position.set(
			u * u * a.x + 2 * u * e * c.x + e * e * (this.port.x - 0.12),
			u * u * a.y + 2 * u * e * c.y + e * e * this.port.y,
			u * u * a.z + 2 * u * e * c.z + e * e * this.port.z
		);
		mesh.rotation.set(lerp(-LEAN, 0, e), lerp(0, -Math.PI / 2, e), 0);
		mesh.scale.setScalar(Math.max(0.001, SMALL * (1 - smooth(seg(k, 0.3, 1)) * 0.999)));
	}

	/**
	 * t: the track's own time, one unit per card. k: how far the side trip has taken over, 0 to 1. base: what the
	 * main story has the harness and server doing, which the trip eases away from and back to.
	 */
	update(t: number, k: number, time: number, base: HarnessPose, baseConnected: number) {
		this.shown = k > 0;
		this.group.visible = this.shown;
		if (!this.shown) {
			this.server.rest();
			return;
		}
		const put = smooth(k);

		/* ---- card 1: the harness wakes and reaches the server, and the server answers ---- */
		const wake = smooth(at(t, 0, 0.08, 0.26));
		const hello = at(t, 0, 0.3, 0.48);
		const reply = at(t, 0, 0.56, 0.74);
		const connected = seg(t, 0.53, 0.56);

		/* ---- card 2: the list ---- */
		const ask = at(t, 1, 0.04, 0.2);
		const listOut = inOut(at(t, 1, 0.2, 0.28)) * (1 - inOut(at(t, 1, 0.54, 0.62)));
		const listUp = outBack(at(t, 1, 0.28, 0.36), 1.2);
		const listFly = at(t, 1, 0.46, 0.58);
		const listCable = at(t, 1, 0.58, 0.72);
		const toolsOpen = inOut(at(t, 1, 0.7, 0.78)) * (1 - inOut(at(t, 2, 0.06, 0.16)));
		const toolsUp = outBack(at(t, 1, 0.76, 0.84), 1.2) * (1 - inOut(at(t, 2, 0.0, 0.07)));
		const toolsGrow = smooth(at(t, 1, 0.76, 0.84));

		/* ---- card 3: the call goes out ---- */
		const callCable = at(t, 2, 0.22, 0.42);
		const callOut = inOut(at(t, 2, 0.4, 0.48)) * (1 - inOut(at(t, 3, 0.4, 0.48)));
		const callUp = outBack(at(t, 2, 0.48, 0.56), 1.2);
		// Used up by the server's work: it sinks into its tray where it stands.
		const callGone = inOut(at(t, 3, 0.03, 0.1));
		const busy = bell(t, 2.6, 3.14);

		/* ---- card 4: the answer comes back ---- */
		const answerUp = outBack(at(t, 3, 0.12, 0.2), 1.2);
		const answerFly = at(t, 3, 0.3, 0.42);
		const answerCable = at(t, 3, 0.42, 0.6);
		const talkOpen = inOut(at(t, 3, 0.58, 0.66)) * (1 - inOut(at(t, 4, 0.06, 0.14)));
		const talkUp = outBack(at(t, 3, 0.64, 0.72), 1.2) * (1 - inOut(at(t, 4, 0.0, 0.07)));
		const talkGrow = smooth(at(t, 3, 0.64, 0.72));

		/* ---- card 5: the three drawers, one at a time ---- */
		const three = SHOW.map(([a, b, c, d]) => inOut(at(t, 4, a, b - 0.02)) * (1 - inOut(at(t, 4, c + 0.02, d))));
		const shown = SHOW.map(([, b, c]) => outBack(at(t, 4, b - 0.02, b + 0.06), 1.2) * (1 - inOut(at(t, 4, c - 0.04, c + 0.02))));
		// What a drawer keeps lies at the back of its tray, and stands up, hinged like everything else, when it's shown.
		for (const { mesh, d, x } of this.kept) {
			const angle = -(LEAN + (1 - Math.min(shown[d] * put, 1.1)) * (Math.PI / 2 - LEAN));
			const half = KEEP_H / 2;
			const hinge = this.server.drawers[d].floor;
			mesh.position.set(x, hinge.y + 0.012 + half * Math.cos(angle), hinge.z + 0.04 + half * Math.sin(angle));
			mesh.rotation.set(angle, 0, 0);
		}

		/* ---- the harness ---- */
		const opens = base.opens.map((o, i) => lerp(o, i === 2 ? toolsOpen : i === 3 ? talkOpen : 0, put));
		const filled = base.filled.map((f, i) => lerp(f, Math.max(f, i === 2 ? toolsGrow : i === 3 ? talkGrow : 0), put));
		const harnessWake = lerp(base.wake, Math.max(base.wake, 0.1 + wake * 0.9), put);
		const jolt = bell(at(t, 0, 0.72, 0.78), 0, 1) * 0.4 + bell(at(t, 1, 0.72, 0.78), 0, 1) * 0.5 + bell(at(t, 3, 0.6, 0.66), 0, 1) * 0.5;
		this.harness.update(opens, filled, harnessWake, time, jolt * put);
		this.harness.group.updateWorldMatrix(true, true);

		/* ---- the server ---- */
		this.outs[0] = Math.max(listOut, callOut, three[0]) * put;
		this.outs[1] = three[1] * put;
		this.outs[2] = three[2] * put;
		const landed = bell(at(t, 0, 0.46, 0.54), 0, 1) + bell(at(t, 2, 0.4, 0.46), 0, 1) * 0.6 + bell(at(t, 3, 0.1, 0.16), 0, 1) * 0.6;
		this.server.pose(lerp(baseConnected, Math.max(baseConnected, connected), put), busy * put, this.outs, landed * put, time);
		this.server.group.updateWorldMatrix(true, true);

		/* ---- the cable ---- */
		let s = -1;
		const slugs: [number, number, string, string][] = [
			[hello, -1, '#ffffff', '#6fb0ff'],
			[reply, 1, '#ffffff', '#6fb0ff'],
			[ask, -1, '#ffffff', '#6fb0ff'],
			[listCable, 1, '#fff3da', '#ffb35c'],
			[callCable, -1, '#ffb35c', '#ff8a1a'],
			[answerCable, 1, '#b8ffd6', '#22d36b']
		];
		for (const [p, way, tint, glow] of slugs) {
			if (p <= 0 || p >= 1) continue;
			s = way > 0 ? p : 1 - p;
			this.slugAt(s, tint, glow);
			break;
		}
		this.slug.visible = s >= 0;
		// Swells as it leaves one end and shrinks as it reaches the other, so it never just appears.
		this.slug.scale.setScalar(s >= 0 ? Math.max(0.001, Math.min(1, s / 0.06, (1 - s) / 0.06) * put) : 0.001);

		/* ---- the messages: each is printed as it stands up in a tray, and used up as it lies back down ---- */
		const tray = this.server.trayHinge(0, this.hinge);
		const lm = this.list.mesh;
		lm.visible = true;
		if (listUp > 0 && listFly <= 0) this.stand(lm, tray, listUp, SMALL * Math.min(1, listUp * 1.4));
		else if (listFly > 0 && listFly < 1) this.toPort(lm, tray, listFly);
		else if (t > 1.6 && t < 2.3 && toolsOpen > 0.02 && toolsGrow > 0) this.stand(lm, this.harness.trayHinge(2, new THREE.Vector3()), toolsUp, BIG * toolsGrow);
		else lm.visible = false;

		const cm = this.call.mesh;
		cm.visible = callUp > 0.001 && callGone < 1;
		if (cm.visible) this.stand(cm, tray, callUp, SMALL * Math.min(1, callUp * 1.4) * (1 - callGone));

		const am = this.answer.mesh;
		am.visible = true;
		if (answerUp > 0 && answerFly <= 0) this.stand(am, tray, answerUp, SMALL * Math.min(1, answerUp * 1.4));
		else if (answerFly > 0 && answerFly < 1) this.toPort(am, tray, answerFly);
		else if (t > 3.5 && t < 4.3 && talkOpen > 0.02 && talkGrow > 0) this.stand(am, this.harness.trayHinge(3, new THREE.Vector3()), talkUp, BIG * talkGrow);
		else am.visible = false;

		// Leaving the trip, whatever is out is put away as the picture goes back to the story.
		for (const m of [lm, cm, am]) m.scale.multiplyScalar(Math.max(0.001, put));
	}
}
