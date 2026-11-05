import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { Label } from '../kit/print';
import { hash, outBack, seg } from '../kit/math';

const R = 1.02;

const glassVert = /* glsl */ `
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
void main(){
	vUv = uv;
	vec4 mv = modelViewMatrix * vec4(position,1.0);
	vV = normalize(-mv.xyz);
	vN = normalize(normalMatrix * normal);
	gl_Position = projectionMatrix * mv;
}`;

const glassFrag = /* glsl */ `
uniform float uTime; uniform float uEnergy; uniform float uLen;
varying vec3 vN; varying vec3 vV; varying vec2 vUv;
float line(float v, float w){ float f = abs(fract(v)-.5); return smoothstep(.5-w,.5,f); }
void main(){
	float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
	vec2 g = vec2(vUv.y*uLen*2.6, vUv.x*22.0);
	float grid = max(line(g.x,.035), line(g.y,.03));
	float sweep = smoothstep(.0,.5,sin(vUv.y*uLen*1.4 + uTime*2.4)*.5+.5);
	vec3 deep = vec3(.05,.34,.95);
	vec3 cyan = vec3(.40,.82,1.0);
	vec3 col = mix(deep,cyan,fres) + cyan*grid*(.25+.55*sweep*uEnergy);
	float a = .24 + fres*.66 + grid*(.24+.34*sweep*uEnergy);
	gl_FragColor = vec4(col*(1.0+uEnergy*.3), clamp(a,0.,.92));
	#include <colorspace_fragment>
}`;

export class Tunnel {
	group = new THREE.Group();
	private uniforms = { uTime: { value: 0 }, uEnergy: { value: 0 }, uLen: { value: 1 } };
	private bricks: THREE.InstancedMesh;
	private shackle = new THREE.Group();
	private lockBody = new THREE.Group();
	private arch = new THREE.Group();
	private archLamp: Lamp;
	private dummy = new THREE.Object3D();
	private archShown = 0;

	constructor(public length: number) {
		const L = length;
		const m = mats();
		const b = new Batch();

		// Flanges at each end and a collar at the middle, lathed so the bevels are real.
		const flangeProfile = [
			[R - 0.04, -0.17],
			[R + 0.13, -0.17],
			[R + 0.2, -0.13],
			[R + 0.2, 0.13],
			[R + 0.13, 0.17],
			[R - 0.04, 0.17]
		].map(([x, y]) => new THREE.Vector2(x, y));
		const flange = new THREE.LatheGeometry(flangeProfile, 72);
		const bolt = new THREE.CylinderGeometry(0.038, 0.044, 0.05, 6);
		for (const x of [0, L]) {
			b.add(flange, m.steel, { p: [x, 0, 0], r: [0, 0, Math.PI / 2] });
			for (let i = 0; i < 16; i++) {
				const a = (i / 16) * Math.PI * 2;
				const face = x === 0 ? -1 : 1;
				b.add(bolt, m.steelSoft, {
					p: [x + face * 0.17, Math.cos(a) * (R + 0.1), Math.sin(a) * (R + 0.1)],
					r: [0, 0, Math.PI / 2]
				});
			}
		}
		const collar = new THREE.LatheGeometry(
			[
				[R - 0.02, -0.1],
				[R + 0.05, -0.1],
				[R + 0.08, -0.07],
				[R + 0.08, 0.07],
				[R + 0.05, 0.1],
				[R - 0.02, 0.1]
			].map(([x, y]) => new THREE.Vector2(x, y)),
			72
		);
		b.add(collar, m.steelSoft, { p: [L / 2, 0, 0], r: [0, 0, Math.PI / 2] });

		this.group.add(b.build('tunnel-frame'));

		// Glass shell.
		this.uniforms.uLen.value = L;
		const glass = new THREE.Mesh(
			new THREE.CylinderGeometry(R, R, L, 96, 1, true),
			new THREE.ShaderMaterial({
				vertexShader: glassVert,
				fragmentShader: glassFrag,
				uniforms: this.uniforms,
				transparent: true,
				depthWrite: false,
				side: THREE.DoubleSide
			})
		);
		glass.rotation.z = Math.PI / 2;
		glass.position.x = L / 2;
		glass.renderOrder = 4;
		this.group.add(glass);

		// Hard reflective skin over the glass so it catches the studio lights.
		const skin = new THREE.Mesh(
			new THREE.CylinderGeometry(R + 0.008, R + 0.008, L, 96, 1, true),
			new THREE.MeshPhysicalMaterial({
				color: '#d5ecff',
				transparent: true,
				opacity: 0.12,
				roughness: 0.16,
				metalness: 0,
				clearcoat: 1,
				clearcoatRoughness: 0.14,
				envMapIntensity: 2.2,
				depthWrite: false
			})
		);
		skin.rotation.z = Math.PI / 2;
		skin.position.x = L / 2;
		skin.renderOrder = 5;
		this.group.add(skin);

		// The ciphertext: little blocks that no longer look like anything readable.
		const brick = rbox(0.17, 0.09, 0.09, 0.02, 2);
		const brickMat = new THREE.MeshStandardMaterial({
			color: '#2f74f0',
			roughness: 0.3,
			emissive: '#0f55ff',
			emissiveIntensity: 1.5
		});
		this.bricks = new THREE.InstancedMesh(brick, brickMat, 180);
		this.bricks.count = 180;
		this.bricks.frustumCulled = false;
		this.group.add(this.bricks);

		this.buildLock(L);
		this.archLamp = this.buildArch(L);
	}

	private buildLock(L: number) {
		const m = mats();
		const body = new Batch();
		const w = 0.74;
		const h = 0.62;
		body.add(extrude(roundedRect(w, h, 0.13), 0.28, 0.05, 4, 10), m.cobalt, { p: [0, 0, 0] });
		body.add(extrude(roundedRect(w - 0.2, h - 0.2, 0.08), 0.02, 0.006, 1, 8), m.steel, { p: [0, 0, 0.142] });
		const hole = new THREE.CircleGeometry(0.058, 20);
		body.add(hole, m.recess, { p: [0, 0.045, 0.156] });
		body.add(rbox(0.05, 0.12, 0.008, 0.003, 1), m.recess, { p: [0, -0.03, 0.155] });
		this.lockBody.add(body.build('lock-body'));

		const sh = new Batch();
		const arc = new THREE.TorusGeometry(0.21, 0.052, 12, 28, Math.PI);
		sh.add(arc, m.steel, { p: [0, 0.23, 0] });
		const leg = new THREE.CylinderGeometry(0.052, 0.052, 0.24, 14);
		sh.add(leg, m.steel, { p: [-0.21, 0.11, 0] });
		sh.add(leg, m.steel, { p: [0.21, 0.11, 0] });
		this.shackle.add(sh.build('lock-shackle'));
		this.shackle.position.y = h / 2 - 0.05;
		this.lockBody.add(this.shackle);

		this.lockBody.position.set(L / 2, R + 0.52, 0);
		// A little yoke seats the lock on the collar.
		const yoke = new Batch();
		yoke.add(rbox(0.52, 0.34, 0.34, 0.06, 3), m.steelSoft, { p: [L / 2, R + 0.14, 0] });
		this.group.add(yoke.build('yoke'));
		this.group.add(this.lockBody);
	}

	/** GitHub's own front door: only there when the reader picked Copilot. */
	private buildArch(L: number) {
		const m = mats();
		const b = new Batch();
		const x = 0;
		const outer = R + 0.56;
		b.add(rbox(0.34, 0.5, outer * 2 + 0.3, 0.07, 3), m.cobalt, { p: [x, outer + 0.05, 0], s: 1 });
		for (const s of [-1, 1]) {
			b.add(rbox(0.34, outer * 2 + 0.2, 0.42, 0.07, 3), m.cobalt, { p: [x, 0.1, s * (outer + 0.02)] });
		}
		this.arch.add(b.build('arch'));
		const plateZ = outer + 0.3;
		const plate = new Batch();
		plate.add(extrude(roundedRect(2.3, 0.44, 0.14), 0.1, 0.026, 3, 10), m.creamLight, { p: [0, 0.42, plateZ] });
		this.arch.add(plate.build('arch-plate'));
		const label = new Label('GitHub Copilot API', 0.19, { weight: 700 });
		label.mesh.position.set(-0.08, 0.416, plateZ + 0.053);
		this.arch.add(label.mesh);
		const lamp = new Lamp(rbox(0.09, 0.09, 0.03, 0.03, 3), color.amber, 1);
		lamp.mesh.position.set(1.0, 0.416, plateZ + 0.054);
		this.arch.add(lamp.mesh);
		this.arch.position.x = L - 1.2;
		this.arch.visible = false;
		this.group.add(this.arch);
		return lamp;
	}

	/**
	 * flow: 0..1, ciphertext enters at the left and is all gone through the right by 1.
	 * lock: 0 open, 1 snapped shut.
	 */
	update(flow: number, lock: number, time: number, dt: number, copilot: boolean, archCheck: number) {
		const L = this.length;
		this.uniforms.uTime.value = time;
		this.uniforms.uEnergy.value = flow > 0 && flow < 1 ? 1 : 0.15;

		// Shackle drops into the body with one small bounce.
		const k = outBack(seg(lock, 0, 1), 3);
		this.shackle.position.y = 0.26 + (0.2 - k * 0.2);
		this.shackle.rotation.y = (1 - seg(lock, 0, 0.5)) * -0.5;
		const nudge = Math.sin(seg(lock, 0.5, 1) * Math.PI) * 0.03;
		this.lockBody.scale.set(1 + nudge, 1 - nudge, 1 + nudge);

		// Ciphertext window.
		const head = seg(flow, 0, 0.5);
		const tail = seg(flow, 0.5, 1);
		const d = this.dummy;
		const n = this.bricks.count;
		for (let i = 0; i < n; i++) {
			const u = (hash(i + 1) + time * 0.1 * (0.8 + hash(i + 7) * 0.5) + flow * 2) % 1;
			const visible = flow > 0 && flow < 1 && u <= head && u >= tail;
			if (!visible) {
				d.scale.setScalar(0);
			} else {
				const a = hash(i + 3) * Math.PI * 2 + u * 3;
				const rad = 0.72 * Math.sqrt(hash(i + 11));
				d.position.set(0.08 + u * (L - 0.16), Math.cos(a) * rad, Math.sin(a) * rad);
				d.rotation.set(hash(i + 5) * 6 + time * 0.8, hash(i + 9) * 6 + time * 0.5, 0);
				const edge = Math.min(1, Math.min(u - tail, head - u) * 18);
				d.scale.setScalar(edge * (0.7 + hash(i + 2) * 0.8));
			}
			d.updateMatrix();
			this.bricks.setMatrixAt(i, d.matrix);
		}
		this.bricks.instanceMatrix.needsUpdate = true;

		// The arch springs up when Copilot is chosen, and drops away when it is not.
		const target = copilot ? 1 : 0;
		this.archShown += (target - this.archShown) * (1 - Math.exp(-dt * 9));
		this.arch.visible = this.archShown > 0.01;
		this.arch.scale.setScalar(Math.max(0.001, this.archShown));
		this.archLamp.mix(color.amber, color.green, archCheck, 1.8);
	}
}

/** Saddle-topped stand under a tunnel flange. y = 0 is the island surface, `h` is the tunnel axis. */
export function createTunnelStand(h: number) {
	const m = mats();
	const b = new Batch();
	const top = h - R - 0.16;
	b.add(rbox(1.5, 0.12, 1.3, 0.05, 3), m.steelSoft, { p: [0, 0.06, 0] });
	b.add(rbox(0.5, top - 0.1, 0.8, 0.09, 3), m.creamLight, { p: [0, 0.1 + (top - 0.1) / 2, 0] });
	b.add(rbox(0.68, 0.18, 1.32, 0.06, 3), m.steel, { p: [0, top + 0.06, 0] });
	return b.build('stand');
}
