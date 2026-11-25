import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox } from '../kit/geometry';
import { color, Lamp } from '../kit/materials';
import { Label } from '../kit/print';
import { inOut, outBack, seg } from '../kit/math';
import { palette } from './palette';
import { fitted, orosi, roseWindow, stainedGlass } from './persian';
import * as P from './masterplan';

/*
 * The provider's front door: a gatehouse of deep jade enamel and polished brass, solid and secure, like the door of a
 * bank. One great round arch straddles both lanes; a thick brass archivolt studded with rivets frames it, and across its
 * crown hangs a row of five brass tumblers, the five checks every request passes on its way in: its seal is broken
 * (decrypt), its key is checked (who are you), its count (rate limit), its coins (budget), and whether there is room
 * (capacity). Each tumbler has a lamp over it, amber while its check runs and green once it has passed, and a brass
 * plaque under it with its name.
 *
 * A round tower stands at each front corner with an arched window and a brass dome; a jade pediment over the arch carries a
 * brass medallion, and behind it a jade cupola with brass ribs and a lit lantern rises over the door. Round windows and arched ones glow
 * amber either side of the arch.
 *
 * Drawn from concepts/aqueduct/door (front, above, section, inside). Its own frame has its foot on the platform at the
 * origin, its front towards +z, the lanes running through it along z.
 */

/** The five checks, in the order a request meets them. */
export const CHECKS = ['Decrypt', 'Who are you?', 'Rate limit', 'Budget', 'Capacity'];

const G = P.GATEHOUSE;
/** The front between the towers, the arch's opening, where the arch springs, and the wall's height. */
const W = 9.0;
const D = G.d;
const DOOR = { w: 5.2, spring: 2.2 };
const WALL = 5.6;
/** The corner towers: how far out, how far forward, how big, how tall. */
const TOWER = { x: W / 2 + 0.85, z: D / 2 - 0.9, r: 1.35, h: 5.4 };
/** The tumblers' row, across the arch under its crown, clear of its curve: how high, and how far apart. */
const TUMBLER = { y: 3.2, gap: 0.96, r: 0.27, len: 0.6 };

/** An arched opening's outline: straight jambs to the spring, a half circle over. */
function arch(w: number, spring: number, segments = 32): [number, number][] {
	const pts: [number, number][] = [[-w / 2, 0]];
	for (let i = 0; i <= segments; i++) {
		const a = Math.PI - (i / segments) * Math.PI;
		pts.push([(w / 2) * Math.cos(a), spring + (w / 2) * Math.sin(a)]);
	}
	pts.push([w / 2, 0]);
	return pts;
}

/** An arched window, as a flat panel the shape of the opening. */
function windowPanel(w: number, h: number) {
	const s = new THREE.Shape();
	const pts = arch(w, h - w / 2, 20);
	s.moveTo(pts[0][0], pts[0][1]);
	for (const [x, y] of pts.slice(1)) s.lineTo(x, y);
	s.closePath();
	return s;
}

export class Gatehouse {
	group = new THREE.Group();
	/** The tumblers' lamps, left to right, each its own, so each can turn green on its own. */
	private lamps: Lamp[] = [];
	private drums: THREE.Object3D[] = [];
	private plaques: THREE.Object3D[] = [];
	/** When a conversation last named each check (the clock's seconds): named one after another, they ripple. */
	private namedAt = CHECKS.map(() => -10);
	private clock = 0;

	constructor() {
		// Its name lets the conversation point at it.
		this.group.name = 'Front door';
		this.group.position.copy(G.at);
		const c = palette();
		const b = new Batch();

		// The front wall and its tunnel: one jade block the depth of the gatehouse, the arch let right through it.
		const outline = new THREE.Shape();
		outline.moveTo(-W / 2, 0);
		for (const [x, y] of arch(DOOR.w, DOOR.spring)) outline.lineTo(x, y);
		outline.lineTo(W / 2, 0);
		outline.lineTo(W / 2, WALL);
		outline.lineTo(-W / 2, WALL);
		outline.closePath();
		b.add(extrude(outline, D, 0.08, 2, 24), c.jade);
		// A brass plinth band along its foot, and a cornice along its top.
		b.add(rbox(W + 0.3, 0.32, D + 0.3, 0.08), c.brass, { p: [0, 0.16, 0] });
		b.add(rbox(W + 0.5, 0.26, D + 0.5, 0.08), c.brass, { p: [0, WALL + 0.13, 0] });

		// The archivolt, front and back: a thick brass band round the arch, brass jambs down to the floor, rivets all round.
		for (const z of [D / 2 + 0.12, -D / 2 - 0.12]) {
			b.add(new THREE.TorusGeometry(DOOR.w / 2 + 0.28, 0.26, 10, 64, Math.PI), c.brass, { p: [0, DOOR.spring, z] });
			for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.26, 0.3, DOOR.spring, 24), c.brass, { p: [s * (DOOR.w / 2 + 0.28), DOOR.spring / 2, z] });
			for (let i = 0; i <= 14; i++) {
				const a = (i / 14) * Math.PI;
				b.add(new THREE.SphereGeometry(0.07, 10, 8), c.gold, { p: [(DOOR.w / 2 + 0.28) * Math.cos(a), DOOR.spring + (DOOR.w / 2 + 0.28) * Math.sin(a), z + Math.sign(z) * 0.24] });
			}
		}
		// The tunnel's lining: brass ribs round the inside of the arch, every so often through the gatehouse's depth.
		for (const z of [-D / 4, 0, D / 4]) b.add(new THREE.TorusGeometry(DOOR.w / 2 - 0.02, 0.07, 10, 64, Math.PI), c.brass, { p: [0, DOOR.spring, z] });

		// The pediment over the arch: a jade segment with a brass rim, a brass medallion on its face.
		const ped = new THREE.Shape();
		ped.moveTo(-3.2, 0);
		ped.quadraticCurveTo(0, 2.2, 3.2, 0);
		ped.closePath();
		b.add(extrude(ped, 1.2, 0.08, 2, 24), c.jadeDeep, { p: [0, WALL + 0.26, D / 2 - 0.6] });
		b.add(new THREE.TorusGeometry(0.62, 0.1, 10, 48), c.brass, { p: [0, WALL + 0.85, D / 2 + 0.06] });
		b.add(new THREE.CylinderGeometry(0.52, 0.52, 0.12, 40), c.brass, { p: [0, WALL + 0.85, D / 2 + 0.02], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.16, 32), c.jade, { p: [0, WALL + 0.85, D / 2 + 0.06], r: [Math.PI / 2, 0, 0] });

		// The cupola behind it: a jade dome on a brass drum, brass ribs over it, and on its crown a small glass lantern
		// lit amber, capped in brass, with a gold finial.
		const domeAt = new THREE.Vector3(0, WALL + 0.26, -0.3);
		b.add(new THREE.CylinderGeometry(2.1, 2.1, 0.5, 48), c.brass, { p: [domeAt.x, domeAt.y + 0.25, domeAt.z] });
		b.add(new THREE.TorusGeometry(2.08, 0.06, 8, 64), c.gold, { p: [domeAt.x, domeAt.y + 0.5, domeAt.z], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.SphereGeometry(2.0, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), c.jade, { p: [domeAt.x, domeAt.y + 0.5, domeAt.z] });
		for (let i = 0; i < 12; i++) {
			const rib = new THREE.TorusGeometry(2.02, 0.045, 8, 32, Math.PI / 2);
			b.add(rib, c.brass, { p: [domeAt.x, domeAt.y + 0.5, domeAt.z], r: [0, (i / 12) * Math.PI * 2, Math.PI / 2] });
		}
		const lanternY = domeAt.y + 2.45;
		b.add(new THREE.CylinderGeometry(0.42, 0.5, 0.12, 24), c.brass, { p: [domeAt.x, lanternY, domeAt.z] });
		b.add(new THREE.CylinderGeometry(0.3, 0.3, 0.46, 24), c.amberWindow, { p: [domeAt.x, lanternY + 0.29, domeAt.z] });
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2;
			b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.46, 8), c.brass, { p: [domeAt.x + Math.sin(a) * 0.33, lanternY + 0.29, domeAt.z + Math.cos(a) * 0.33] });
		}
		b.add(new THREE.ConeGeometry(0.44, 0.34, 24), c.brass, { p: [domeAt.x, lanternY + 0.69, domeAt.z] });
		b.add(new THREE.SphereGeometry(0.12, 16, 12), c.gold, { p: [domeAt.x, lanternY + 0.92, domeAt.z] });

		// Its windows are coloured glass in dark wood, as the hall's are: see persian.ts.
		const glass = new Batch();
		const panes = stainedGlass(orosi(0.47), true);
		const rose = stainedGlass(roseWindow(), true);
		const towerPane = fitted(windowPanel(0.9, 1.9));
		const frontPane = fitted(windowPanel(0.8, 1.5));
		// The corner towers: jade drums with brass bands, an arched window of coloured glass, a brass dome with a finial.
		for (const s of [-1, 1]) {
			const x = s * TOWER.x;
			const z = TOWER.z;
			b.add(new THREE.CylinderGeometry(TOWER.r + 0.25, TOWER.r + 0.35, 0.4, 48), c.porcelain, { p: [x, 0.2, z] });
			b.add(new THREE.CylinderGeometry(TOWER.r, TOWER.r, TOWER.h, 48), c.jade, { p: [x, TOWER.h / 2, z] });
			for (const y of [0.5, TOWER.h * 0.62, TOWER.h - 0.1]) b.add(new THREE.TorusGeometry(TOWER.r + 0.02, 0.09, 10, 64), c.brass, { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
			b.add(extrude(windowPanel(0.9, 1.9), 0.08, 0.02, 2, 12), c.walnut, { p: [x, 1.4, z + TOWER.r - 0.02] });
			glass.add(towerPane, panes, { p: [x, 1.4, z + TOWER.r + 0.023] });
			b.add(new THREE.TorusGeometry(0.47, 0.06, 8, 32, Math.PI), c.brass, { p: [x, 1.4 + 1.9 - 0.45, z + TOWER.r + 0.02] });
			b.add(new THREE.CylinderGeometry(TOWER.r + 0.15, TOWER.r + 0.15, 0.3, 48), c.brass, { p: [x, TOWER.h + 0.15, z] });
			b.add(new THREE.SphereGeometry(TOWER.r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), c.brass, { p: [x, TOWER.h + 0.3, z] });
			b.add(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 12), c.gold, { p: [x, TOWER.h + 0.3 + TOWER.r + 0.3, z] });
			b.add(new THREE.SphereGeometry(0.2, 16, 12), c.gold, { p: [x, TOWER.h + 0.3 + TOWER.r + 0.7, z] });
			// A round window high on the front, and an arched one low, between the arch and the tower.
			const wx = s * (DOOR.w / 2 + 1.25);
			b.add(new THREE.CylinderGeometry(0.42, 0.42, 0.1, 32), c.walnut, { p: [wx, 3.8, D / 2 + 0.02], r: [Math.PI / 2, 0, 0] });
			glass.add(new THREE.CircleGeometry(0.42, 40), rose, { p: [wx, 3.8, D / 2 + 0.072] });
			b.add(new THREE.TorusGeometry(0.46, 0.08, 10, 40), c.brass, { p: [wx, 3.8, D / 2 + 0.06] });
			b.add(extrude(windowPanel(0.8, 1.5), 0.08, 0.02, 2, 12), c.walnut, { p: [wx, 0.8, D / 2 + 0.01] });
			glass.add(frontPane, panes, { p: [wx, 0.8, D / 2 + 0.053] });
		}

		// The beam across the arch's crown that carries the tumblers.
		b.add(new THREE.CylinderGeometry(0.1, 0.1, DOOR.w - 0.2, 16), c.brass, { p: [0, TUMBLER.y + TUMBLER.r + 0.18, D / 2 - 0.4], r: [0, 0, Math.PI / 2] });
		this.group.add(b.build('gatehouse'), glass.build('gatehouse-windows'));

		// The five tumblers: brass drums turning on the beam, ribbed, each with its own lamp on top and its name under it.
		const drumGeo = new THREE.CylinderGeometry(TUMBLER.r, TUMBLER.r, TUMBLER.len, 32);
		const ribGeo = new THREE.TorusGeometry(TUMBLER.r + 0.01, 0.025, 6, 32);
		for (let i = 0; i < 5; i++) {
			const x = (i - 2) * TUMBLER.gap;
			const drum = new THREE.Group();
			drum.position.set(x, TUMBLER.y, D / 2 - 0.4);
			const body = new THREE.Mesh(drumGeo, c.brass);
			body.rotation.z = Math.PI / 2;
			drum.add(body);
			for (const dx of [-0.2, 0, 0.2]) {
				const rib = new THREE.Mesh(ribGeo, c.gold);
				rib.rotation.y = Math.PI / 2;
				rib.position.x = dx;
				drum.add(rib);
			}
			const hanger = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.12), c.brass);
			hanger.position.set(0, TUMBLER.r + 0.1, 0);
			this.group.add(drum);
			this.drums.push(drum);
			const lamp = new Lamp(new THREE.SphereGeometry(0.1, 16, 12), color.amber, 0.2);
			lamp.mesh.position.set(x, TUMBLER.y + TUMBLER.r + 0.36, D / 2 - 0.05);
			const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.1, 0.1, 16), c.brass);
			cup.position.set(x, TUMBLER.y + TUMBLER.r + 0.27, D / 2 - 0.05);
			this.group.add(lamp.mesh, cup, hanger);
			hanger.position.add(drum.position);
			this.lamps.push(lamp);
			// Its plaque: cream in a brass frame, hung from the drum's axle on two short rods.
			const plaque = new THREE.Group();
			plaque.position.set(x, TUMBLER.y - TUMBLER.r - 0.36, D / 2 - 0.4);
			const pb = new Batch();
			pb.add(rbox(0.92, 0.3, 0.06, 0.03), c.brass);
			pb.add(rbox(0.84, 0.22, 0.04, 0.02), c.cream, { p: [0, 0, 0.025] });
			for (const s of [-1, 1]) pb.add(new THREE.CylinderGeometry(0.018, 0.018, 0.26, 8), c.brass, { p: [s * 0.3, 0.27, 0] });
			plaque.add(pb.build(`check-${i}`));
			const name = new Label(CHECKS[i], 0.095, { weight: 700 });
			name.mesh.position.set(0, 0, 0.047);
			plaque.add(name.mesh);
			this.group.add(plaque);
			this.plaques.push(plaque);
		}
	}

	/** A conversation names one of the checks: its plaque nods forward and back, its lamp flares. */
	name(i: number) {
		if (i >= 0 && i < this.namedAt.length) this.namedAt[i] = this.clock;
	}

	/**
	 * checks: how far the request has got through the five checks, 0 to 5: each tumbler turns a notch while its check
	 * runs, its lamp blinking amber, and its lamp stays green once it has passed. Below 0, at rest: the lamps glow dimly
	 * and the drums tick over, as a door does that others are going through.
	 */
	update(time: number, checks = -1) {
		this.clock = time;
		const idle = checks < 0;
		const ticking = idle ? (time * 0.8) % 7 : checks;
		this.drums.forEach((drum, i) => {
			const turn = idle ? Math.min(1, Math.max(0, ticking - i)) + Math.floor((time * 0.8) / 7) : outBack(seg(checks, i, i + 0.5), 2);
			drum.rotation.x = -turn * (Math.PI / 2);
		});
		this.lamps.forEach((lamp, i) => {
			const since = time - this.namedAt[i];
			const nod = since >= 0 && since < 1.1 ? Math.sin((since / 1.1) * Math.PI) : 0;
			this.plaques[i].rotation.x = nod * 0.32;
			if (idle) lamp.mix(color.amber, color.green, THREE.MathUtils.clamp(ticking - i, 0, 1), 0.25 + nod * 1.5);
			else if (checks >= i + 0.5) lamp.set(color.green, 1.4 + nod * 1.6);
			else if (checks >= i) lamp.set(color.amber, 1.1 + Math.sin(time * 14) * 0.6);
			else lamp.set(color.amber, 0.12 + nod * 1.5);
			if (nod > 0) this.plaques[i].position.z = D / 2 - 0.4 + inOut(nod) * 0.12;
		});
	}
}
