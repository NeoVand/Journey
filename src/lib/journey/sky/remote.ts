import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude } from '../kit/geometry';
import { palette, tinted } from './palette';
import * as P from './masterplan';

/*
 * Other companies' MCP servers: small towers on the horizon, each run by someone else and each in its own colours. A
 * slender drum with arched lit windows between pilasters, a gold cornice, a ribbed dome with a gold spire; it stands on a
 * round platform with a brass railing and a tapered porcelain underside, like a spinning top, lamps under its rim. At the
 * platform's edge a brass mooring ring holds its cable: a long sag of tiny lights down to a post on your desk; and one of
 * them is moored to the provider's tower too, which can call it itself.
 *
 * Drawn from concepts/aqueduct/edges (remote).
 */

export class RemoteTowers {
	group = new THREE.Group();
	private beads: THREE.MeshStandardMaterial;

	constructor() {
		this.group.name = 'remote MCP servers';
		const c = palette();
		this.beads = new THREE.MeshStandardMaterial({ color: '#ffe39a', emissive: '#ffb52e', emissiveIntensity: 1.8 });
		const b = new Batch();
		const rings: THREE.Vector3[] = [];
		for (const T of P.REMOTE) {
			const at = T.at;
			const t = tinted(T.tint);
			const light = tinted(new THREE.Color(T.tint).lerp(new THREE.Color('#ffffff'), 0.35).getStyle());
			// The platform: a disc with a gold edge, a spinning-top underside, lamps under its rim, a brass railing.
			b.add(new THREE.CylinderGeometry(2.3, 2.3, 0.3, 48), c.porcelain, { p: [at.x, at.y - 0.15, at.z] });
			b.add(new THREE.CylinderGeometry(2.25, 0.25, 2.2, 48), c.porcelain, { p: [at.x, at.y - 1.4, at.z] });
			b.add(new THREE.TorusGeometry(2.32, 0.06, 8, 64), c.gold, { p: [at.x, at.y - 0.3, at.z], r: [Math.PI / 2, 0, 0] });
			b.add(new THREE.ConeGeometry(0.12, 0.5, 12), c.gold, { p: [at.x, at.y - 2.7, at.z], r: [Math.PI, 0, 0] });
			for (let i = 0; i < 10; i++) {
				const a = (i / 10) * Math.PI * 2;
				b.add(new THREE.SphereGeometry(0.09, 10, 8), c.amberWindow, { p: [at.x + 2.05 * Math.cos(a), at.y - 0.45, at.z + 2.05 * Math.sin(a)] });
			}
			b.add(new THREE.TorusGeometry(2.05, 0.035, 6, 64), c.brass, { p: [at.x, at.y + 0.6, at.z], r: [Math.PI / 2, 0, 0] });
			for (let i = 0; i < 18; i++) {
				const a = (i / 18) * Math.PI * 2;
				b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 6), c.brass, { p: [at.x + 2.05 * Math.cos(a), at.y + 0.3, at.z + 2.05 * Math.sin(a)] });
			}
			// The tower: a drum between pilasters, arched windows lit, a gold cornice, a ribbed dome and its spire.
			b.add(new THREE.CylinderGeometry(1.15, 1.2, 2.8, 40), t, { p: [at.x, at.y + 1.4, at.z] });
			for (let i = 0; i < 8; i++) {
				const a = (i / 8) * Math.PI * 2;
				b.add(new THREE.CylinderGeometry(0.1, 0.1, 2.8, 10), light, { p: [at.x + 1.2 * Math.sin(a), at.y + 1.4, at.z + 1.2 * Math.cos(a)] });
				const w = a + Math.PI / 8;
				b.add(extrude(arch(0.42, 1.2), 0.05, 0.015, 1, 10), c.amberWindow, { p: [at.x + 1.16 * Math.sin(w), at.y + 0.8, at.z + 1.16 * Math.cos(w)], r: [0, w, 0] });
			}
			b.add(new THREE.CylinderGeometry(1.32, 1.32, 0.22, 40), c.gold, { p: [at.x, at.y + 2.9, at.z] });
			b.add(new THREE.SphereGeometry(1.15, 40, 16, 0, Math.PI * 2, 0, Math.PI / 2), t, { p: [at.x, at.y + 3.0, at.z] });
			for (let i = 0; i < 8; i++) b.add(new THREE.TorusGeometry(1.16, 0.035, 6, 24, Math.PI / 2), c.gold, { p: [at.x, at.y + 3.0, at.z], r: [0, (i / 8) * Math.PI * 2, Math.PI / 2] });
			b.add(new THREE.CylinderGeometry(0.1, 0.16, 0.5, 12), c.gold, { p: [at.x, at.y + 4.35, at.z] });
			b.add(new THREE.SphereGeometry(0.14, 12, 8), c.gold, { p: [at.x, at.y + 4.7, at.z] });
			b.add(new THREE.ConeGeometry(0.06, 0.6, 10), c.gold, { p: [at.x, at.y + 5.1, at.z] });
			// The mooring ring at the platform's edge, on the side towards the world.
			const toward = new THREE.Vector3(-at.x, 0, -at.z - 20).normalize();
			const ring = at.clone().addScaledVector(toward, 2.35).setY(at.y - 0.25);
			b.add(new THREE.TorusGeometry(0.22, 0.06, 10, 24), c.brass, { p: ring.toArray() as [number, number, number], r: [0, Math.atan2(toward.x, toward.z), 0] });
			rings.push(ring);
		}
		// The cables: each a sag of tiny lights from its tower's mooring ring to where it is moored.
		for (const { from, to } of P.REMOTE_CABLES) {
			const a = rings[from];
			const end = to.clone().setY(to.y + 1.45);
			const sag = a.distanceTo(end) * 0.12;
			const curve = new THREE.CatmullRomCurve3(
				Array.from({ length: 41 }, (_, i) => {
					const u = i / 40;
					const p = a.clone().lerp(end, u);
					p.y -= sag * 4 * u * (1 - u);
					return p;
				})
			);
			b.add(new THREE.TubeGeometry(curve, 160, 0.035, 6), c.brass);
			const n = Math.floor(curve.getLength() / 0.7);
			const bead = new THREE.SphereGeometry(0.09, 8, 6);
			for (let i = 1; i < n; i++) b.add(bead, this.beads, { p: curve.getPointAt(i / n).toArray() as [number, number, number] });
		}
		this.group.add(b.build('remote towers'));
	}

	/** Their lights run on as if something were going along them. */
	update(time: number) {
		this.beads.emissiveIntensity = 1.6 + 0.3 * Math.sin(time * 2.2);
	}
}

function arch(w: number, h: number) {
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-w / 2, h - w / 2);
	s.absarc(0, h - w / 2, w / 2, Math.PI, 0, true);
	s.lineTo(w / 2, 0);
	s.closePath();
	return s;
}
