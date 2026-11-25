import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox } from '../kit/geometry';
import { hazed, palette } from './palette';
import { span } from './aqueduct';
import * as P from './masterplan';

/*
 * The proving ground, where agents are tested: a round deck of mint-green enamel on porcelain arches, laid out as a test
 * course with crisp white lines, a ramp over a little bridge, blocks and hoops and cones to get round, bright pennants on
 * brass poles, a brass railing round its rim. Beside the course, a white observatory with a violet dome and a brass
 * telescope watches many runs, and scores them on a board of lamps: green for a pass, red for a fail.
 *
 * Drawn from concepts/aqueduct/edges (proving). Its frame is the deck's top at its middle.
 */

const G = P.PROVING;
const R = G.r;

export class Proving {
	group = new THREE.Group();
	private board: THREE.MeshStandardMaterial[] = [];

	constructor() {
		this.group.name = 'proving ground';
		this.group.position.copy(G.at);
		const c = palette();
		const pier = hazed(c.porcelain);
		const b = new Batch();
		const ground = new Batch();

		// The deck: mint enamel on a porcelain drum that tapers under it, a gold edge, a brass railing.
		b.add(new THREE.CylinderGeometry(R, R, 0.3, 96), c.mintEnamel, { p: [0, -0.15, 0] });
		b.add(new THREE.CylinderGeometry(R + 0.12, R - 0.4, 0.9, 96), c.porcelain, { p: [0, -0.75, 0] });
		b.add(new THREE.TorusGeometry(R + 0.06, 0.08, 10, 128), c.gold, { p: [0, -0.32, 0], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(R - 0.25, 0.04, 6, 128), c.brass, { p: [0, 0.75, 0], r: [Math.PI / 2, 0, 0] });
		for (let i = 0; i < 40; i++) {
			const a = (i / 40) * Math.PI * 2;
			b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.75, 6), c.brass, { p: [(R - 0.25) * Math.cos(a), 0.38, (R - 0.25) * Math.sin(a)] });
		}
		// Four arches under it, from pier to pier round its middle.
		const under = G.at.y - 1.2;
		const corners = [0, 1, 2, 3].map((i) => {
			const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
			return new THREE.Vector3(G.at.x + (R - 2.2) * Math.cos(a), under, G.at.z + (R - 2.2) * Math.sin(a));
		});
		for (let i = 0; i < 4; i++) span(ground, corners[i], corners[(i + 1) % 4], 1.4, pier, 'pier');

		// The course: a white oval track inside a white ring, a dashed line between, all let into the enamel.
		const line = (r: number, w = 0.12) => b.add(new THREE.RingGeometry(r - w / 2, r + w / 2, 128), c.white, { p: [0, 0.006, 0], r: [-Math.PI / 2, 0, 0] });
		line(R - 0.9);
		line(R - 2.4);
		for (let i = 0; i < 36; i++) {
			const a = (i / 36) * Math.PI * 2;
			b.add(rbox(0.3, 0.012, 0.08, 0.004), c.white, { p: [(R - 1.65) * Math.cos(a), 0.008, (R - 1.65) * Math.sin(a)], r: [0, -a + Math.PI / 2, 0] });
		}
		// The obstacles: a ramp over a little bridge, three blocks, three hoops, two cones.
		const ramp = new THREE.Shape();
		ramp.moveTo(-1.6, 0);
		ramp.quadraticCurveTo(0, 1.6, 1.6, 0);
		ramp.lineTo(1.2, 0);
		ramp.quadraticCurveTo(0, 1.1, -1.2, 0);
		ramp.closePath();
		b.add(extrude(ramp, 1.1, 0.06, 2, 24), c.white, { p: [-1.2, 0, 1.4], r: [0, 0.4, 0] });
		for (let i = 0; i < 3; i++) b.add(rbox(0.7, 0.5, 0.7, 0.08), c.white, { p: [0.4 + i * 1.0, 0.25, -0.6] });
		for (let i = 0; i < 3; i++) b.add(new THREE.TorusGeometry(0.38, 0.06, 10, 28, Math.PI), c.gold, { p: [1.4 + i * 0.75, 0, 1.8], r: [0, 0.3, 0] });
		for (const [x, z] of [
			[-2.6, -1.4],
			[-2.2, -2.2]
		]) {
			b.add(new THREE.ConeGeometry(0.2, 0.55, 18), c.mastRed, { p: [x, 0.28, z] });
			b.add(new THREE.CylinderGeometry(0.12, 0.15, 0.1, 18), c.mastWhite, { p: [x, 0.3, z] });
		}
		// Pennants round the rim on brass poles.
		for (let i = 0; i < 6; i++) {
			const a = (i / 6) * Math.PI * 2 + 0.25;
			const x = (R - 0.5) * Math.cos(a);
			const z = (R - 0.5) * Math.sin(a);
			b.add(new THREE.CylinderGeometry(0.04, 0.05, 2.0, 10), c.brass, { p: [x, 1.0, z] });
			b.add(new THREE.SphereGeometry(0.07, 10, 8), c.gold, { p: [x, 2.04, z] });
			const flag = new THREE.Shape();
			flag.moveTo(0, 0);
			flag.lineTo(0.75, -0.2);
			flag.lineTo(0, -0.45);
			flag.closePath();
			b.add(extrude(flag, 0.03, 0.01, 1, 4), c.pennant, { p: [x + 0.04, 1.95, z], r: [0, -a, 0] });
		}

		// The observatory: a white drum with arched windows and a gold cornice, a ribbed violet dome, a brass telescope.
		const O = G.observatory.clone().sub(G.at);
		b.add(new THREE.CylinderGeometry(1.9, 2.0, 2.6, 48), c.white, { p: [O.x, 1.3, O.z] });
		b.add(new THREE.CylinderGeometry(2.05, 2.05, 0.2, 48), c.gold, { p: [O.x, 2.6, O.z] });
		for (let i = 0; i < 8; i++) {
			const a = (i / 8) * Math.PI * 2;
			b.add(extrude(arch(0.5, 1.1), 0.06, 0.02, 1, 12), c.amberWindow, { p: [O.x + 1.92 * Math.sin(a), 0.9, O.z + 1.92 * Math.cos(a)], r: [0, a, 0] });
			b.add(new THREE.SphereGeometry(0.06, 8, 6), c.gold, { p: [O.x + 2.0 * Math.sin(a + 0.39), 2.35, O.z + 2.0 * Math.cos(a + 0.39)] });
		}
		b.add(new THREE.SphereGeometry(1.95, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2), c.violet, { p: [O.x, 2.7, O.z] });
		for (let i = 0; i < 8; i++) b.add(new THREE.TorusGeometry(1.96, 0.04, 6, 32, Math.PI / 2), c.gold, { p: [O.x, 2.7, O.z], r: [0, (i / 8) * Math.PI * 2, Math.PI / 2] });
		b.add(new THREE.CylinderGeometry(0.28, 0.4, 2.4, 24), c.brass, { p: [O.x - 0.7, 4.3, O.z + 0.6], r: [0.55, 0, 0.6] });
		b.add(new THREE.TorusGeometry(0.42, 0.08, 10, 24), c.gold, { p: [O.x - 1.35, 5.0, O.z + 1.15], r: [0.55, 0, 0.6] });
		// The board of lamps beside it, on a brass frame, scoring the runs.
		const bx = O.x - 2.6;
		const bz = O.z + 0.4;
		b.add(rbox(2.0, 1.3, 0.2, 0.08), c.cream, { p: [bx, 1.6, bz], r: [0, 0.9, 0] });
		b.add(rbox(2.2, 1.5, 0.12, 0.06), c.brass, { p: [bx - 0.06, 1.6, bz - 0.06], r: [0, 0.9, 0] });
		for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), c.brass, { p: [bx + s * 0.62, 0.5, bz - s * 0.78] });
		const face = new THREE.Vector3(Math.sin(0.9), 0, Math.cos(0.9));
		const across = new THREE.Vector3(Math.cos(0.9), 0, -Math.sin(0.9));
		for (let row = 0; row < 3; row++)
			for (let col = 0; col < 6; col++) {
				const pass = (row * 7 + col * 3) % 5 !== 0;
				const lamp = new THREE.MeshStandardMaterial({ color: pass ? '#173b22' : '#3b1717', emissive: pass ? '#2bdc63' : '#ff4a3c', emissiveIntensity: 1.2 });
				this.board.push(lamp);
				const at = new THREE.Vector3(bx, 1.95 - row * 0.35, bz).addScaledVector(across, -0.75 + col * 0.3).addScaledVector(face, 0.12);
				b.add(new THREE.SphereGeometry(0.09, 12, 8), lamp, { p: at.toArray() as [number, number, number] });
			}
		// A little bridge across to the provider's platform.
		span(ground, new THREE.Vector3(G.at.x - R + 0.4, G.at.y - 0.6, G.at.z), new THREE.Vector3(9.6, P.PLATFORM_Y - 0.6, G.at.z), 1.6, pier, 'none');

		this.group.add(b.build('proving ground'));
		const grounded = ground.build('proving arches');
		grounded.position.copy(G.at).negate();
		this.group.add(grounded);
	}

	update(time: number) {
		this.board.forEach((m, i) => (m.emissiveIntensity = 0.9 + 0.6 * Math.max(0, Math.sin(time * 1.5 - i * 0.4))));
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
