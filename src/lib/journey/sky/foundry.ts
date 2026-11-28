import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect, sweep } from '../kit/geometry';
import { paintCloud, seeded } from '../props/sky';
import { hazed, palette } from './palette';
import { span } from './aqueduct';
import * as P from './masterplan';

/*
 * The foundry: where the model was made, long before your prompt. A training hall of riveted dark iron and polished
 * copper on its own deck of arches beside the provider's tower, hot and heavy and old. Its heart is a great furnace in an
 * arch of copper, glowing deep orange: data goes in, as a train of paper wagons on a little track, and the model's
 * numbers are forged from it. Two iron stacks banded in copper breathe steam; big copper pipes bend between them.
 *
 * What it made sits on the deck's far side: the finished model, small and glowing in a glass carriage, at the foot of a
 * slender rail that climbs on light arches of its own to the roof of the tower: the track it was carried up on.
 *
 * Drawn from concepts/aqueduct/edges (foundry, rail). The building is drawn in its own frame, the deck's top at its
 * middle with the furnace towards +x, and turned so the furnace faces the reader; its arches, the rail and the carriage
 * are in the world's frame.
 */

const F = P.FOUNDRY;
const DECK = { w: 15, d: 10.5, corner: 2.4 };
const HALL = { x: -1.6, w: 7.4, d: 5.2, h: 3.6 };

export class Foundry {
	group = new THREE.Group();
	/** The building and its deck, turned to face the reader. */
	private body = new THREE.Group();
	private glow: THREE.MeshStandardMaterial;
	private steam: { sprite: THREE.Sprite; base: THREE.Vector3; phase: number }[] = [];
	private carriage = new THREE.Group();
	private rail: THREE.CatmullRomCurve3;

	constructor() {
		this.group.name = 'foundry';
		this.body.position.copy(F.at);
		this.body.rotation.y = -Math.PI / 2;
		this.group.add(this.body);
		const c = palette();
		const pier = hazed(c.porcelain);
		this.glow = new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#ff5200', emissiveIntensity: 5 });
		const b = new Batch();
		// What stands on the world's own ground: the arches (their piers go down into the haze) and the rail.
		const ground = new Batch();

		// The deck: porcelain with a gold edge, dark iron plates on top, a brass railing round it, arches under it.
		b.add(extrude(roundedRect(DECK.w, DECK.d, DECK.corner), 0.9, 0.18, 3, 24), c.porcelain, { r: [-Math.PI / 2, 0, 0], p: [0, -0.45, 0] });
		b.add(extrude(roundedRect(DECK.w - 0.8, DECK.d - 0.8, DECK.corner - 0.4), 0.06, 0.02, 1, 24), c.iron, { r: [-Math.PI / 2, 0, 0], p: [0, 0.02, 0] });
		b.add(extrude(roundedRect(DECK.w + 0.06, DECK.d + 0.06, DECK.corner), 0.1, 0.03, 1, 24), c.gold, { r: [-Math.PI / 2, 0, 0], p: [0, -0.2, 0] });
		this.railing(b, DECK.w - 0.5, DECK.d - 0.5, DECK.corner - 0.25);
		for (const z of [-DECK.d / 2 + 1.4, DECK.d / 2 - 1.4])
			for (let i = 0; i < 2; i++) {
				const x0 = -DECK.w / 2 + 1.8 + ((DECK.w - 3.6) * i) / 2;
				const x1 = -DECK.w / 2 + 1.8 + ((DECK.w - 3.6) * (i + 1)) / 2;
				// The deck's long sides run along the world's z once it is turned.
				const at = (x: number) => new THREE.Vector3(F.at.x - z, F.at.y - 1.05, F.at.z + x);
				span(ground, at(x0), at(x1), 1.6, pier, i === 1 ? 'both' : 'pier');
			}

		// The hall: riveted iron, a copper barrel roof over it, small windows glowing all along.
		b.add(rbox(HALL.w, HALL.h, HALL.d, 0.14), c.iron, { p: [HALL.x, HALL.h / 2, 0] });
		b.add(new THREE.CylinderGeometry(HALL.d / 2, HALL.d / 2, HALL.w - 0.4, 40, 1, false, 0, Math.PI), c.copper, { p: [HALL.x, HALL.h, 0], r: [0, 0, Math.PI / 2] });
		for (const x of [HALL.x - HALL.w / 2 + 0.2, HALL.x + HALL.w / 2 - 0.2]) b.add(new THREE.TorusGeometry(HALL.d / 2 + 0.03, 0.08, 8, 32, Math.PI), c.copper, { p: [x, HALL.h, 0], r: [0, Math.PI / 2, 0] });
		for (const s of [-1, 1]) {
			for (let i = 0; i < 5; i++) {
				const x = HALL.x - HALL.w / 2 + 0.9 + i * 1.4;
				b.add(extrude(arch(0.5, 1.0), 0.06, 0.02, 1, 12), this.glow, { p: [x, 1.2, s * (HALL.d / 2 + 0.01)], r: [0, s > 0 ? 0 : Math.PI, 0] });
				b.add(new THREE.TorusGeometry(0.27, 0.04, 6, 16, Math.PI), c.copper, { p: [x, 1.95, s * (HALL.d / 2 + 0.04)], r: [0, s > 0 ? 0 : Math.PI, 0] });
			}
			// Rows of rivets along its foot and its eaves.
			for (let x = HALL.x - HALL.w / 2 + 0.3; x < HALL.x + HALL.w / 2; x += 0.45)
				for (const y of [0.3, HALL.h - 0.2]) b.add(new THREE.SphereGeometry(0.05, 8, 6), c.copper, { p: [x, y, s * (HALL.d / 2 + 0.02)] });
		}
		// The furnace block on the hall's provider end: a copper arch round a deep mouth of fire, a copper dome over it.
		const fx = HALL.x + HALL.w / 2 + 0.9;
		b.add(rbox(2.0, 4.2, 4.0, 0.16), c.iron, { p: [fx, 2.1, 0] });
		b.add(new THREE.TorusGeometry(1.35, 0.2, 10, 40, Math.PI), c.copper, { p: [fx + 1.02, 2.1, 0], r: [0, Math.PI / 2, 0] });
		for (const s of [-1, 1]) b.add(rbox(0.3, 2.1, 0.4, 0.06), c.copper, { p: [fx + 1.02, 1.05, s * 1.35] });
		for (let i = 0; i <= 10; i++) {
			const a = (i / 10) * Math.PI;
			b.add(new THREE.SphereGeometry(0.06, 8, 6), c.gold, { p: [fx + 1.24, 2.1 + 1.35 * Math.sin(a), 1.35 * Math.cos(a)] });
		}
		b.add(extrude(arch(2.3, 3.2), 0.06, 0.02, 2, 24), this.glow, { p: [fx + 1.0, 0, 0], r: [0, Math.PI / 2, 0] });
		b.add(new THREE.CylinderGeometry(1.4, 1.5, 0.4, 32), c.copper, { p: [fx, 4.4, 0] });
		b.add(new THREE.SphereGeometry(1.35, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), c.copper, { p: [fx, 4.6, 0] });
		b.add(new THREE.SphereGeometry(0.18, 12, 8), c.gold, { p: [fx, 6.05, 0] });

		// The stacks, iron banded in copper, and the big copper pipes bending between the hall and the stacks.
		const stacks: [number, number, number][] = [
			[HALL.x - 2.4, -1.2, 6.8],
			[HALL.x - 1.0, -1.4, 7.4]
		];
		for (const [x, z, h] of stacks) {
			b.add(new THREE.CylinderGeometry(0.48, 0.58, h, 28), c.iron, { p: [x, h / 2, z] });
			for (const y of [h * 0.35, h * 0.7, h - 0.05]) b.add(new THREE.TorusGeometry(0.55, 0.08, 8, 28), c.copper, { p: [x, y, z], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.CylinderGeometry(0.66, 0.5, 0.4, 28), c.copper, { p: [x, h + 0.2, z] });
		}
		const pipe = (pts: [number, number, number][], r: number) => b.add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p)), false, 'catmullrom', 0.2), 40, r, 12), c.copper);
		pipe([[HALL.x + 1.6, HALL.h + 1.2, -1.2], [HALL.x + 1.6, HALL.h + 2.6, -1.2], [HALL.x + 0.2, HALL.h + 2.9, -1.4], [HALL.x - 1.0, HALL.h + 2.4, -1.4]], 0.22);
		pipe([[HALL.x - HALL.w / 2 - 0.1, 1.2, 1.6], [HALL.x - HALL.w / 2 - 0.9, 1.2, 1.6], [HALL.x - HALL.w / 2 - 0.9, HALL.h + 1.4, 0.4], [HALL.x - 2.4, HALL.h + 1.6, -1.2]], 0.2);
		// A little copper-domed tower at its far corner.
		b.add(new THREE.CylinderGeometry(0.8, 0.85, 3.0, 28), c.iron, { p: [HALL.x - HALL.w / 2 + 0.5, 1.5, HALL.d / 2 - 0.2] });
		b.add(new THREE.SphereGeometry(0.85, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), c.copper, { p: [HALL.x - HALL.w / 2 + 0.5, 3.0, HALL.d / 2 - 0.2] });

		// The paper train: wagons of paper on a little track that runs from the deck's front edge straight into the
		// furnace's mouth, the first wagon already half inside.
		const t0 = fx + 0.9;
		const t1 = DECK.w / 2 - 0.5;
		b.add(rbox(t1 - t0, 0.06, 0.9, 0.02), c.walnut, { p: [(t0 + t1) / 2, 0.08, 0] });
		for (const s of [-1, 1]) b.add(rbox(t1 - t0, 0.06, 0.06, 0.02), c.brass, { p: [(t0 + t1) / 2, 0.14, s * 0.32] });
		for (let i = 0; i < 3; i++) {
			const x = fx + 1.3 + i * 1.45;
			b.add(rbox(1.25, 0.18, 0.8, 0.05), c.brass, { p: [x, 0.3, 0] });
			b.add(rbox(1.15, 0.55, 0.72, 0.18), c.paper, { p: [x, 0.66, 0] });
			for (const dx of [-0.42, 0.42]) b.add(new THREE.CylinderGeometry(0.12, 0.12, 0.84, 12), c.iron, { p: [x + dx, 0.2, 0], r: [Math.PI / 2, 0, 0] });
		}

		// The rail up to the tower's roof, from the deck's provider side, on slender piers of its own: it climbs too steeply
		// for arches, so each pier carries it on a brass saddle. It leaps off the deck's corner over the coral server's
		// cable, which hangs just under its lower stretch, so the first pier stands past that; the last stands clear of the
		// provider's platform, whose edge the rail crosses a little higher, and from there it reaches the roof alone.
		this.rail = new THREE.CatmullRomCurve3(P.FOUNDRY_RAIL.map((p) => new THREE.Vector3(...p)), false, 'centripetal');
		const rail = ground;
		rail.add(sweep(this.rail, [[-0.75, 0], [0.75, 0], [0.75, -0.35], [-0.75, -0.35]], 80), c.porcelain);
		for (const s of [-1, 1]) rail.add(sweep(this.rail, [[s * 0.45 - 0.05, 0.12], [s * 0.45 + 0.05, 0.12], [s * 0.45 + 0.05, 0], [s * 0.45 - 0.05, 0]], 80), c.brass);
		for (const u of [0.35, 0.49, 0.63, 0.77]) {
			const p = this.rail.getPointAt(u);
			const t = this.rail.getTangentAt(u);
			const yaw = Math.atan2(-t.z, t.x);
			// The rail's underside, square to it, is a little less than its depth below its line where it climbs.
			const top = p.y - 0.35 * Math.sqrt(1 - t.y * t.y) - 0.18;
			const h = top - P.PIER_FOOT;
			rail.add(new THREE.CylinderGeometry(0.3, 0.34, h, 24), pier, { p: [p.x, P.PIER_FOOT + h / 2, p.z] });
			rail.add(new THREE.CylinderGeometry(0.38, 0.38, 0.12, 24), c.gold, { p: [p.x, top - 0.1, p.z] });
			// The saddle: a brass block on the pier's head, its top sloped to the rail.
			rail.add(rbox(0.9, 0.24, 1.2, 0.05, 1), c.brass, { p: [p.x, top + 0.06, p.z], r: [0, yaw, Math.atan(t.y / Math.hypot(t.x, t.z))] });
		}
		this.body.add(b.build('foundry'));
		this.group.add(ground.build('foundry arches'));

		// The carriage: glass on a brass chassis, the finished model in it, small and glowing.
		const car = new Batch();
		const capsule = new THREE.CapsuleGeometry(0.7, 1.4, 8, 24).rotateZ(Math.PI / 2);
		// The chassis rides on four iron wheels, each standing on one of the rail's two brass strips.
		car.add(rbox(2.4, 0.26, 1.2, 0.08), c.brass, { p: [0, 0.4, 0] });
		for (const dx of [-0.8, 0.8]) for (const s of [-1, 1]) car.add(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), c.iron, { p: [dx, 0.29, s * 0.45], r: [Math.PI / 2, 0, 0] });
		car.add(capsule, c.glass, { p: [0, 1.15, 0] });
		car.add(new THREE.TorusGeometry(0.72, 0.05, 8, 32), c.brass, { p: [0, 1.15, 0], r: [0, Math.PI / 2, 0] });
		const brain = new THREE.SphereGeometry(0.48, 28, 14).scale(1.25, 0.8, 0.95);
		car.add(brain, new THREE.MeshPhysicalMaterial({ color: '#1d44b8', roughness: 0.25, clearcoat: 1, emissive: '#2a52d8', emissiveIntensity: 0.3 }), { p: [0, 1.12, 0] });
		for (let i = 0; i < 5; i++) car.add(new THREE.TorusGeometry(0.34 - i * 0.03, 0.05, 8, 24, Math.PI * 1.2), c.gold, { p: [-0.35 + i * 0.18, 1.18, 0.12 - i * 0.05], r: [Math.PI / 2, 0.3 * i, 0] });
		this.carriage.add(car.build('carriage'));
		this.group.add(this.carriage);

		// The steam: soft puffs rising off each stack and thinning as they go.
		const rand = seeded(5);
		const tex = paintCloud(911, 0.6);
		for (const [x, z, h] of stacks)
			for (let i = 0; i < 4; i++) {
				const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, opacity: 0.8 }));
				this.steam.push({ sprite, base: new THREE.Vector3(x, h + 0.6, z), phase: i / 4 + rand() * 0.1 });
				this.body.add(sprite);
			}
	}

	/** A brass railing round the deck: a rail on posts, following its rounded outline. */
	private railing(b: Batch, w: number, d: number, r: number) {
		const c = palette();
		const pts = roundedRect(w, d, r).getSpacedPoints(120);
		const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p.x, 0.75, -p.y)), true);
		b.add(new THREE.TubeGeometry(curve, 200, 0.04, 6, true), c.brass);
		for (let i = 0; i < pts.length; i += 4) b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), c.brass, { p: [pts[i].x, 0.38, -pts[i].y] });
	}

	update(time: number) {
		this.glow.emissiveIntensity = 4.6 + 0.8 * Math.sin(time * 3.1) + 0.4 * Math.sin(time * 7.3);
		for (const s of this.steam) {
			const k = (time * 0.18 + s.phase) % 1;
			s.sprite.position.copy(s.base).add(new THREE.Vector3(k * 1.6, k * 4.5, k * -0.4));
			const size = 1.2 + k * 3.2;
			s.sprite.scale.set(size, size * 0.6, 1);
			(s.sprite.material as THREE.SpriteMaterial).opacity = 0.85 * Math.sin(Math.PI * Math.min(1, k * 1.2));
		}
		// The carriage waits at the rail's foot, a little way up: the model was made here and carried up there.
		const u = 0.06;
		const p = this.rail.getPointAt(u);
		const t = this.rail.getTangentAt(u);
		this.carriage.position.copy(p);
		this.carriage.rotation.set(0, Math.atan2(-t.z, t.x), Math.asin(t.y));
	}
}

/** An arched window's outline: straight sides and a round head. */
function arch(w: number, h: number) {
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-w / 2, h - w / 2);
	s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
	s.lineTo(w / 2, 0);
	s.closePath();
	return s;
}
