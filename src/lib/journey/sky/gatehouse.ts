import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox } from '../kit/geometry';
import { color, Lamp } from '../kit/materials';
import { Label } from '../kit/print';
import { inOut, outBack, seg } from '../kit/math';
import { palette } from './palette';
import { archFrame, archHalfWidth, archLine, fitted, glazed, laid, orosi, pointedArch, ribbon, roseWindow, stainedGlass } from './persian';
import * as P from './masterplan';

/*
 * The provider's front door: a gatehouse of deep jade enamel and polished brass, solid and secure, like the door of a
 * bank, with its arch set in a Persian iwan. One great pointed arch straddles both lanes, set in a pishtaq, a tall jade
 * frame faced in the hall's tile, proud of the front and rising over the roof; a gold rim runs round the arch, and in its
 * head a hood of niches in tiers (a muqarnas) hangs over a row of five brass tumblers, the five checks every request
 * passes on its way in: its seal is broken (decrypt), its key is checked (who are you), its count (rate limit), its coins
 * (budget), and whether there is room (capacity). Each tumbler has a lamp over it, amber while its check runs and green
 * once it has passed, and a brass plaque under it with its name. Behind, where the hall sees it, the arch keeps a thick
 * band of riveted brass.
 *
 * A round tower stands at each front corner, with an arched window of coloured glass and a rose over it and a brass dome;
 * behind the pishtaq a jade cupola with brass ribs and a lit lantern rises over the door.
 *
 * Drawn from concepts/aqueduct/door (front, above, section, inside). Its own frame has its foot on the platform at the
 * origin, its front towards +z, the lanes running through it along z.
 */

/** The five checks, in the order a request meets them. */
export const CHECKS = ['Decrypt', 'Who are you?', 'Rate limit', 'Budget', 'Capacity'];

const G = P.GATEHOUSE;
/** The front between the towers, and the wall's height. */
const W = 9.0;
const D = G.d;
const WALL = 5.6;
/** The arch: pointed, as the hall's windows are; the lanes' way through, and the iwan's mouth. */
const DOOR = { w: 5.6, h: 5.2, rise: 3.2 };
const half = (y: number) => archHalfWidth(y, DOOR.w, DOOR.h, DOOR.rise);
/**
 * The pishtaq: the tiled frame the arch is set in, proud of the front wall and rising over its roof. How far out from
 * the middle, how high, its front and back, the brass foot it stands on, its border's width and the border's repeat,
 * which goes a whole number of times up each side and across the top, so its corners fall where one repeat meets the next.
 */
const PISH = { half: 3.85, top: 7.075, front: D / 2 + 0.45, back: D / 2 - 0.1, foot: 0.35, border: 0.4, repeat: 0.575 };
/** The field's star repeat: four and a half to each side of the middle, so its edges run through rows of stars. */
const FIELD = (PISH.half - PISH.border) / 4;
/**
 * The hood in the arch's head, over the tumblers: tiers of niches, each set further forward than the one under it, as a
 * muqarnas is. Each tier's foot, its face, how many niches, and the plate closing the head behind them.
 */
const HOOD = { y: [4.05, 4.42, 4.79], z: [1.15, 1.6, 2.05], cells: [6, 5, 3], back: 0.72 };
/** A niche is a little taller than it is wide. */
const NICHE = 1.2;
/** The corner towers: how far out, how far forward, how big, how tall. */
const TOWER = { x: W / 2 + 0.85, z: D / 2 - 0.9, r: 1.35, h: 5.4 };
/** The tumblers' row, across the arch under its crown, clear of its curve: how high, and how far apart. */
const TUMBLER = { y: 3.2, gap: 0.96, r: 0.27, len: 0.6 };
/** The towers' rose windows, over their arched ones. */
const ROSE_Y = 4.3;

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

/** A niche's head: the back half of a dome, turned inside out so it's seen from within, as a niche is. */
function niche(r: number) {
	const g = new THREE.SphereGeometry(r, 14, 6, Math.PI, Math.PI, 0, Math.PI / 2).scale(1, NICHE, 1);
	const idx = g.index!.array;
	const flipped: number[] = [];
	for (let i = 0; i < idx.length; i += 3) flipped.push(idx[i], idx[i + 2], idx[i + 1]);
	g.setIndex(flipped);
	const n = g.attributes.normal as THREE.BufferAttribute;
	for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i));
	return g;
}

/** The arch's cross-section between two heights, for the hood's plates. */
function slice(lo: number, hi: number) {
	const s = new THREE.Shape();
	const n = 10;
	for (let i = 0; i <= n; i++) {
		const y = lo + ((hi - lo) * i) / n;
		if (i) s.lineTo(-half(y), y);
		else s.moveTo(-half(y), y);
	}
	for (let i = n; i >= 0; i--) {
		const y = lo + ((hi - lo) * i) / n;
		if (i === n && half(y) < 1e-4) continue;
		s.lineTo(half(y), y);
	}
	s.closePath();
	return s;
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
		const line = archLine(DOOR.w, DOOR.h, DOOR.rise);
		const outline = new THREE.Shape();
		outline.moveTo(-W / 2, 0);
		for (const p of line) outline.lineTo(p.x, p.y);
		outline.lineTo(W / 2, 0);
		outline.lineTo(W / 2, WALL);
		outline.lineTo(-W / 2, WALL);
		outline.closePath();
		b.add(extrude(outline, D, 0.08, 2, 24), c.jade);
		// A brass plinth band along its foot, and a cornice along its top.
		b.add(rbox(W + 0.3, 0.32, D + 0.3, 0.08), c.brass, { p: [0, 0.16, 0] });
		b.add(rbox(W + 0.5, 0.26, D + 0.5, 0.08), c.brass, { p: [0, WALL + 0.13, 0] });

		// Behind, where the hall sees it, the arch keeps its bank-door brass: a thick band round it, studded with rivets.
		b.add(extrude(archFrame(DOOR.w, DOOR.h, 0.32, DOOR.rise), 0.14, 0.03, 2, 16), c.brass, { p: [0, 0, -D / 2 - 0.05] });
		for (const p of pointedArch(DOOR.w + 0.32, DOOR.h + 0.16, DOOR.rise + 0.16).getSpacedPoints(36))
			if (p.y > 0.5) b.add(new THREE.SphereGeometry(0.065, 10, 8), c.gold, { p: [p.x, p.y, -D / 2 - 0.13] });
		// The tunnel's lining: brass ribs round the inside of the arch, through the gatehouse's depth behind the hood.
		for (const z of [-1.25, -0.1]) b.add(extrude(archFrame(DOOR.w - 0.16, DOOR.h - 0.08, 0.08, DOOR.rise - 0.08), 0.12, 0.02, 1, 16), c.brass, { p: [0, 0, z] });

		this.iwan(b);

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
		// The corner towers: jade drums with brass bands, an arched window of coloured glass low and a rose over it, a brass
		// dome with a finial. The front between them is the pishtaq's now.
		for (const s of [-1, 1]) {
			const x = s * TOWER.x;
			const z = TOWER.z;
			const face = z + TOWER.r;
			b.add(new THREE.CylinderGeometry(TOWER.r + 0.25, TOWER.r + 0.35, 0.4, 48), c.porcelain, { p: [x, 0.2, z] });
			b.add(new THREE.CylinderGeometry(TOWER.r, TOWER.r, TOWER.h, 48), c.jade, { p: [x, TOWER.h / 2, z] });
			for (const y of [0.5, TOWER.h * 0.62, TOWER.h - 0.1]) b.add(new THREE.TorusGeometry(TOWER.r + 0.02, 0.09, 10, 64), c.brass, { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
			b.add(extrude(windowPanel(0.9, 1.9), 0.08, 0.02, 2, 12), c.walnut, { p: [x, 1.4, face - 0.02] });
			glass.add(towerPane, panes, { p: [x, 1.4, face + 0.023] });
			b.add(new THREE.TorusGeometry(0.47, 0.06, 8, 32, Math.PI), c.brass, { p: [x, 1.4 + 1.9 - 0.45, face + 0.02] });
			b.add(new THREE.CylinderGeometry(0.4, 0.4, 0.1, 32), c.walnut, { p: [x, ROSE_Y, face - 0.02], r: [Math.PI / 2, 0, 0] });
			glass.add(new THREE.CircleGeometry(0.4, 40), rose, { p: [x, ROSE_Y, face + 0.033] });
			b.add(new THREE.TorusGeometry(0.44, 0.07, 10, 40), c.brass, { p: [x, ROSE_Y, face + 0.02] });
			b.add(new THREE.CylinderGeometry(TOWER.r + 0.15, TOWER.r + 0.15, 0.3, 48), c.brass, { p: [x, TOWER.h + 0.15, z] });
			b.add(new THREE.SphereGeometry(TOWER.r, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), c.brass, { p: [x, TOWER.h + 0.3, z] });
			b.add(new THREE.CylinderGeometry(0.06, 0.1, 0.7, 12), c.gold, { p: [x, TOWER.h + 0.3 + TOWER.r + 0.3, z] });
			b.add(new THREE.SphereGeometry(0.2, 16, 12), c.gold, { p: [x, TOWER.h + 0.3 + TOWER.r + 0.7, z] });
		}

		// The beam across the arch that carries the tumblers, its ends seated in the jambs.
		const beamY = TUMBLER.y + TUMBLER.r + 0.18;
		b.add(new THREE.CylinderGeometry(0.1, 0.1, half(beamY) * 2 + 0.3, 16), c.brass, { p: [0, beamY, D / 2 - 0.4], r: [0, 0, Math.PI / 2] });
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
			// Clear of the hanger in the middle, which holds the drum's axle.
			for (const dx of [-0.22, -0.1, 0.1, 0.22]) {
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

	/**
	 * The iwan: the arch set in a pishtaq, a jade slab faced in tile, as the hall behind it is tiled (see persian.ts). A
	 * turquoise border round its edge, a gold rim round the arch with a frieze outside it, and the star field between,
	 * set out from the arch's middle so its edges run through rows of stars. In the arch's head over the tumblers, a hood
	 * of niches in three tiers, each tier further forward than the one under it.
	 */
	private iwan(b: Batch) {
		const c = palette();
		const t = glazed();
		const { half: PW, top: PT, front, back, foot, border, repeat } = PISH;
		const V = (x: number, y: number) => new THREE.Vector2(x, y);
		const slab = new THREE.Shape();
		slab.moveTo(-PW, 0);
		for (const p of archLine(DOOR.w, DOOR.h, DOOR.rise)) slab.lineTo(p.x, p.y);
		slab.lineTo(PW, 0);
		slab.lineTo(PW, PT);
		slab.lineTo(-PW, PT);
		slab.closePath();
		b.add(extrude(slab, front - back, 0.04, 2, 16), c.jade, { p: [0, 0, (front + back) / 2] });
		// Brass along its foot either side of the arch, and a coping along its top.
		const footW = PW - DOOR.w / 2 - 0.1;
		for (const s of [-1, 1]) b.add(rbox(footW, foot, front - back + 0.1, 0.04), c.brass, { p: [s * (PW - footW / 2), foot / 2, (front + back) / 2 + 0.02] });
		b.add(rbox(PW * 2 + 0.14, 0.14, front - back + 0.14, 0.04), c.brass, { p: [0, PT + 0.07, (front + back) / 2] });

		const z = front + 0.004;
		// The gold rim round the arch, and the frieze outside it, mirrored about the arch's point.
		b.add(extrude(archFrame(DOOR.w, DOOR.h, 0.1, DOOR.rise), 0.08, 0.02, 1, 16), c.gold, { p: [0, 0, front + 0.02] });
		const rim = archLine(DOOR.w + 0.2, DOOR.h + 0.1, DOOR.rise + 0.1, 24).map((p) => (p.y < foot ? V(p.x, foot) : p));
		let length = 0;
		for (let i = 1; i < rim.length; i++) length += rim[i].distanceTo(rim[i - 1]);
		const band = ribbon(rim, 0.3, length / (2 * Math.max(1, Math.round(length / 1.2))), true);
		b.add(band, t.frieze, { p: [0, 0, z] });
		// The border round the slab's edge.
		const IX = PW - border;
		const IT = PT - border;
		b.add(ribbon([V(-IX, foot), V(-IX, IT), V(IX, IT), V(IX, foot)], border, repeat), t.border, { p: [0, 0, z] });
		// The field between them, its outline the frieze's outer edge.
		const pos = band.attributes.position as THREE.BufferAttribute;
		const field = new THREE.Shape();
		field.moveTo(-IX, foot);
		field.lineTo(-IX, IT);
		field.lineTo(IX, IT);
		field.lineTo(IX, foot);
		for (let i = pos.count - 1; i > 0; i -= 2) field.lineTo(pos.getX(i), pos.getY(i));
		field.closePath();
		b.add(
			laid(field, (x, y) => [x / FIELD + 0.5, (y - IT) / FIELD]),
			t.field,
			{ p: [0, 0, z] }
		);

		// The hood. Each tier's face is a white plate with its niches let into it close together, turquoise inside and
		// rimmed in gold, standing on a turquoise shelf with a gold lip along its foot; one tier more than the next, so each
		// tier's niches sit between the ones under them. The lowest plate closes the whole head, a jade plate behind it.
		const ys = [...HOOD.y, DOOR.h];
		const zs = [HOOD.back, ...HOOD.z];
		const tops = [DOOR.h, ys[2], DOOR.h];
		for (let k = 0; k < 3; k++) {
			const lo = ys[k];
			const ye = lo + 0.06;
			b.add(rbox(half(lo) * 2, 0.06, zs[k + 1] - zs[k], 0.012), t.turquoise, { p: [0, lo + 0.03, (zs[k] + zs[k + 1]) / 2] });
			b.add(rbox(half(lo) * 2, 0.05, 0.04, 0.01), c.gold, { p: [0, lo + 0.035, zs[k + 1] + 0.02] });
			const n = HOOD.cells[k];
			const step = (2 * half((ye + ys[k + 1]) / 2) - 0.1) / n;
			let r = Math.min((ys[k + 1] - ye - 0.035) / NICHE, step / 2 - 0.035);
			const xs = Array.from({ length: n }, (_, i) => (i - (n - 1) / 2) * step);
			const fits = (rr: number) =>
				xs.every((cx) => {
					for (let a = 0; a <= 16; a++) {
						const th = (a / 16) * Math.PI;
						const y = ye + rr * NICHE * Math.sin(th);
						if (Math.abs(cx + rr * Math.cos(th)) > half(y) - 0.05) return false;
					}
					return true;
				});
			while (!fits(r) && r > 0.06) r *= 0.95;
			const plate = slice(lo, tops[k]);
			for (const cx of xs) {
				const hole = new THREE.Path();
				hole.moveTo(cx + r, ye);
				hole.absellipse(cx, ye, r, r * NICHE, 0, Math.PI, false, 0);
				hole.closePath();
				plate.holes.push(hole);
				b.add(niche(r), t.turquoise, { p: [cx, ye, HOOD.z[k]] });
				b.add(new THREE.TorusGeometry(r + 0.012, 0.016, 4, 16, Math.PI).scale(1, NICHE, 1), c.gold, { p: [cx, ye, HOOD.z[k]] });
			}
			b.add(new THREE.ShapeGeometry(plate, 8), t.white, { p: [0, 0, HOOD.z[k]] });
		}
		b.add(extrude(slice(ys[0], DOOR.h), 0.06, 0.01, 1, 8), c.jade, { p: [0, 0, HOOD.back - 0.03] });
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
