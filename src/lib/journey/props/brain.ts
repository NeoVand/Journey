import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asset } from '$app/paths';
import { hitBall } from '../poke';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect, sweep } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { seg, smooth } from '../kit/math';
import { islandAt, machine, shadowOn } from '../kit/machines';
import { createCastShadow } from './island';

/*
 * The model, as what it is: a very large brain, fitted out by someone who only knows how to make machines.
 * Long axis along X with the front at +X, the fissure in the plane z = 0, and the near side facing +Z.
 * Origin at the middle of the brain.
 *
 * The brain itself is a real one. Its cortex is the left hemisphere of a 25-year-old's MRI, from the UCSF Neuroscape lab's
 * Glass Brain, which they gave to the public domain (NIH 3D, 3DPX-000757). It was smoothed of scanner noise, its folds
 * deepened a little, thinned, and given a brainstem modelled to fit it; the right half is its mirror. Each vertex carries
 * how open it is to the sky (red), how high it stands above the folds around it (green) and which part it belongs to
 * (blue): see static/models/brain.glb, made in Blender and packed with gltfpack.
 */

/** Height of the flat seat the intake stands on, above the brain's centre. */
export const BRAIN_SEAT = 3.96;
/** The stem and pedestal go down this far below the brain's centre, to the island's top. */
export const BRAIN_FOOT = 7.5;

/** Where the brainstem comes down into its collar on the pedestal. */
const STEM_X = -1.4;
/** The collar the brainstem goes down into, on top of the pedestal's neck. */
const COLLAR_Y = -4.66;

/**
 * The signal running over the surface, shared by the brain's material and every copy a visit makes of it: how far the
 * waves have travelled, how brightly they show, and their colour.
 */
const waves = {
	uWaveTime: { value: 0 },
	uWaveGain: { value: 0.6 },
	uWaveColor: { value: new THREE.Color('#62eeff') }
};

type Part = 'cortex' | 'brainstem';
let anatomy: Record<Part, THREE.BufferGeometry> | null = null;

const smoothstep = (a: number, b: number, v: number) => smooth(seg(v, a, b));

/** Plain float positions and colours in the brain's own frame: the file packs them, and keeps each part's placement on its node. */
function unpack(mesh: THREE.Mesh) {
	mesh.updateWorldMatrix(true, false);
	const src = mesh.geometry;
	const g = new THREE.BufferGeometry();
	for (const name of ['position', 'color']) {
		const a = src.getAttribute(name);
		if (!a) continue;
		const out = new Float32Array(a.count * 3);
		for (let i = 0; i < a.count; i++) for (let k = 0; k < 3; k++) out[i * 3 + k] = a.getComponent(i, k);
		g.setAttribute(name, new THREE.BufferAttribute(out, 3));
	}
	g.setIndex(new THREE.BufferAttribute(Uint32Array.from(src.index!.array), 1));
	g.applyMatrix4(mesh.matrixWorld);
	return g;
}

/** A plain stand-in, only if the file can't be had: an egg of a brain, all of it open and none of it folded. */
function standIn(): Record<Part, THREE.BufferGeometry> {
	const blob = (sx: number, sy: number, sz: number, x: number, y: number, z: number) => {
		const g = new THREE.SphereGeometry(1, 48, 32);
		g.deleteAttribute('normal');
		g.deleteAttribute('uv');
		g.scale(sx, sy, sz).translate(x, y, z);
		g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(0.8), 3));
		return g;
	};
	return { cortex: blob(5.8, 3.6, 2.3, 0.25, 0.1, -2.5), brainstem: blob(0.7, 2.2, 0.7, -1.1, -2.9, 0) };
}

/**
 * Glazed blue tissue with electronic waves running over it: rings of signal spreading out from the intake on the roof
 * and down over both halves, and slower sweeps travelling round the brain. They show brightest along the crowns of the
 * folds; the deepest creases keep a faint light of their own, as if from inside. A class of its own, so the copy a visit
 * dresses the brain in keeps its waves.
 */
class Tissue extends THREE.MeshPhysicalMaterial {
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, waves);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float crown;\nvarying float vCrown;\nvarying vec3 vBrainPos;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvCrown = crown;\nvBrainPos = position;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform float uWaveTime;\nuniform float uWaveGain;\nuniform vec3 uWaveColor;\nvarying float vCrown;\nvarying vec3 vBrainPos;')
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					vec3 p = vBrainPos;
					// Out from the intake: rings, each a thin bright front with a short trail behind it, wavering as they go.
					float d = length(p - vec3(0.0, ${BRAIN_SEAT.toFixed(2)}, 0.0)) + 0.45 * sin(0.9 * p.x + 0.5 * p.z) * cos(0.7 * p.y - 0.35 * p.z);
					float a = fract((d - uWaveTime) / 2.6);
					float wa = fwidth(a);
					float ring = (smoothstep(0.972 - wa, 0.994, a) * 1.4 + pow(a, 14.0) * 0.45) * (1.0 - smoothstep(1.0 - wa * 1.5, 1.0, a));
					// Round the brain: fainter lines travelling the other way, leaning as they climb, so the two kinds cross.
					float turn = atan(p.z, p.x + 0.3) / 6.28318 * 7.0 + p.y * 0.12 - uWaveTime * 0.08;
					float b = abs(fract(turn) - 0.5) * 2.0;
					float wb = fwidth(turn) * 2.0;
					float line = 1.0 - smoothstep(0.0, 0.06 + wb, 1.0 - b);
					float crownLight = mix(0.55, 1.0, smoothstep(0.25, 0.8, vCrown));
					float creaseLight = 1.0 - smoothstep(0.0, 0.3, vCrown);
					totalEmissiveRadiance += uWaveColor * uWaveGain * ((ring + line * 0.32) * crownLight + creaseLight * 0.28);
				}`
			);
	}
}

export function gearShape(teeth: number, pitch: number, holes = 0) {
	const shape = new THREE.Shape();
	const step = (Math.PI * 2) / teeth;
	const root = pitch - 0.075;
	const tip = pitch + 0.065;
	for (let i = 0; i < teeth; i++) {
		const a = i * step;
		const pts: [number, number][] = [
			[root, a - step * 0.3],
			[tip, a - step * 0.15],
			[tip, a + step * 0.15],
			[root, a + step * 0.3]
		];
		pts.forEach(([r, t], k) => {
			const x = Math.cos(t) * r;
			const y = Math.sin(t) * r;
			if (i === 0 && k === 0) shape.moveTo(x, y);
			else shape.lineTo(x, y);
		});
	}
	shape.closePath();
	for (let i = 0; i < holes; i++) {
		const a = (i / holes) * Math.PI * 2;
		const hole = new THREE.Path();
		hole.absarc(Math.cos(a) * pitch * 0.55, Math.sin(a) * pitch * 0.55, pitch * 0.2, 0, Math.PI * 2, true);
		shape.holes.push(hole);
	}
	return shape;
}

export class Brain {
	group = new THREE.Group();
	private tissue: Tissue;
	private lamps: Lamp[] = [];
	hit!: THREE.Mesh;
	private excited = 0;
	private extraTurn = 0;
	private lastUpdate = 0;

	/** Fetches the brain's anatomy, once, before the world is built. Without it the model still stands, as a plain egg. */
	static async load() {
		if (anatomy) return;
		try {
			const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset('models/brain.glb'));
			const found: Partial<Record<Part, THREE.BufferGeometry>> = {};
			gltf.scene.traverse((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh) return;
				const part = [mesh.name, mesh.parent?.name].find((n) => n === 'cortex' || n === 'brainstem') as Part | undefined;
				if (part) found[part] = unpack(mesh);
				mesh.geometry.dispose();
			});
			if (found.cortex && found.brainstem) anatomy = found as Record<Part, THREE.BufferGeometry>;
		} catch (e) {
			console.warn('The brain could not be loaded, so it stands in as an egg.', e);
		}
	}

	constructor() {
		this.tissue = new Tissue({
			color: '#2f68f5',
			roughness: 0.42,
			metalness: 0,
			clearcoat: 0.75,
			clearcoatRoughness: 0.2,
			sheen: 0.7,
			sheenColor: '#a8d8ff',
			sheenRoughness: 0.45,
			vertexColors: true,
			// It shines with its own waves: an emissive colour, at nothing, tells a visit not to light it up in amber as well.
			emissive: '#7fe6ff',
			emissiveIntensity: 0
		});
		const parts = anatomy ?? standIn();
		this.buildTissue(parts);
		this.buildKeel(parts.cortex);
		this.buildSeat();
		this.buildStem();
	}

	/* ---- the brain: both halves of the cortex and the brainstem, as one glazed body ---- */
	private buildTissue(parts: Record<Part, THREE.BufferGeometry>) {
		const far = parts.cortex.clone();
		const near = parts.cortex.clone();
		const p = near.getAttribute('position') as THREE.BufferAttribute;
		for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i));
		// A mirror turns every triangle inside out, unless they're wound the other way.
		const index = near.getIndex()!;
		for (let i = 0; i < index.count; i += 3) {
			const b = index.getX(i + 1);
			index.setX(i + 1, index.getX(i + 2));
			index.setX(i + 2, b);
		}
		const geo = mergeGeometries([far, near, parts.brainstem]);
		far.dispose();
		near.dispose();
		const pos = geo.getAttribute('position');
		const baked = geo.getAttribute('color');
		const count = pos.count;
		const tint = new Float32Array(count * 3);
		const crowns = new Float32Array(count);
		const deep = new THREE.Color('#10145a');
		const white = new THREE.Color(1, 1, 1);
		const pale = new THREE.Color(0.92, 0.94, 1);
		const c = new THREE.Color();
		for (let i = 0; i < count; i++) {
			const open = smoothstep(0.04, 0.85, baked.getX(i));
			const crown = baked.getY(i);
			// The creases fall into a deep indigo, the crowns stand in full colour, and the brainstem a shade paler.
			c.copy(deep).lerp(white, Math.min(1, open ** 1.2 * 0.62 + crown * 0.48));
			if (baked.getZ(i) > 0.5) c.lerp(pale, 0.3);
			c.toArray(tint, i * 3);
			crowns[i] = crown;
		}
		geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
		geo.setAttribute('crown', new THREE.BufferAttribute(crowns, 1));
		geo.computeVertexNormals();
		geo.computeBoundingSphere();

		const mesh = new THREE.Mesh(geo, this.tissue);
		// The brain itself, by name, so the conversation can show the whole model and not only the plinth it sits on.
		mesh.name = 'brain';
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		this.group.add(mesh);

		// The pointer presses the cerebrum: a ball round both halves, not the stem below them.
		const cerebrum = new THREE.Box3().setFromBufferAttribute(parts.cortex.getAttribute('position') as THREE.BufferAttribute);
		cerebrum.min.z = Math.min(cerebrum.min.z, -cerebrum.max.z);
		cerebrum.max.z = -cerebrum.min.z;
		const round = cerebrum.getBoundingSphere(new THREE.Sphere());
		this.hit = hitBall(round.radius);
		this.hit.position.copy(round.center);
		this.group.add(this.hit);
	}

	/* ---- a steel spine down the fissure between the halves, just under their inner edges, with lamps along it ---- */
	private buildKeel(cortex: THREE.BufferGeometry) {
		const pos = cortex.getAttribute('position');
		// The top of the fissure along the brain: the highest the halves' inner edges reach, at each place along it.
		const x0 = -4.9;
		const x1 = 5.3;
		const steps = 41;
		const crest = new Array(steps).fill(-Infinity);
		for (let i = 0; i < pos.count; i++) {
			if (Math.abs(pos.getZ(i)) > 0.75) continue;
			const k = Math.round(((pos.getX(i) - x0) / (x1 - x0)) * (steps - 1));
			if (k >= 0 && k < steps) crest[k] = Math.max(crest[k], pos.getY(i));
		}
		const points: THREE.Vector3[] = [];
		for (let k = 0; k < steps; k++) {
			const near = crest.slice(Math.max(0, k - 2), k + 3).filter(Number.isFinite);
			const y = near.length ? near.reduce((s, c) => s + c, 0) / near.length : 0;
			// Its ends go down into the fissure rather than stop in the air.
			const u = k / (steps - 1);
			const dive = 1.1 * (smoothstep(0.12, 0, u) + smoothstep(0.88, 1, u));
			points.push(new THREE.Vector3(THREE.MathUtils.lerp(x0, x1, u), y - 0.2 - dive, 0));
		}
		const path = new THREE.CatmullRomCurve3(points, false, 'centripetal');
		path.arcLengthDivisions = 300;
		const W = 0.2;
		const profile: [number, number][] = [
			[-W, -1.8],
			[-W, -0.06],
			[-W + 0.06, 0],
			[W - 0.06, 0],
			[W, -0.06],
			[W, -1.8]
		];
		const keel = new THREE.Mesh(sweep(path, profile, 180), new THREE.MeshStandardMaterial({ color: '#99a3b4', metalness: 0.6, roughness: 0.4 }));
		keel.castShadow = true;
		keel.receiveShadow = true;
		this.group.add(keel);
		const up = new THREE.Vector3();
		for (let i = 1; i < 26; i++) {
			const u = i / 26;
			if (i % 3 !== 1) continue;
			const p = path.getPointAt(u);
			// None under the seat.
			if (Math.abs(p.x) < 2.6) continue;
			const t = path.getTangentAt(u);
			up.set(-t.y, t.x, 0);
			if (up.y < 0) up.negate();
			const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
			const lamp = new Lamp(rbox(0.3, 0.05, 0.22, 0.02, 2), color.amber, 0.4);
			lamp.mesh.position.copy(p).addScaledVector(up, 0.02);
			lamp.mesh.quaternion.copy(q);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
		}
	}

	/* ---- the seat the intake stands on, sunk into the top of the brain: its top is exactly the intake's underside ---- */
	private buildSeat() {
		const m = mats();
		const Y = BRAIN_SEAT;
		const seat = new Batch();
		seat.add(extrude(roundedRect(4.5, 4.7, 0.5), 0.9, 0.1, 4, 12), m.steelSoft, { p: [0, Y - 0.45, 0], r: [-Math.PI / 2, 0, 0] });
		// Below the plate, a block that goes down into the brain, so the plate never stands clear of the folds it sits on.
		seat.add(extrude(roundedRect(3.9, 4.1, 0.45), 1.5, 0.06, 3, 12), m.steel, { p: [0, Y - 1.4, 0], r: [-Math.PI / 2, 0, 0] });
		this.group.add(seat.build('seat'));
	}

	/* ---- the brainstem goes down into a collar on the pedestal's neck; then the pedestal, and the island it all stands on ---- */
	private buildStem() {
		const m = mats();
		const sx = STEM_X;
		const bottom = -BRAIN_FOOT + 1.72;
		const profile = [
			[0.001, COLLAR_Y + 0.02],
			[0.76, COLLAR_Y + 0.02],
			[0.84, COLLAR_Y - 0.08],
			[0.8, COLLAR_Y - 0.3],
			[0.7, COLLAR_Y - 0.5],
			[0.72, -5.2],
			[0.95, -5.45],
			[1.45, bottom + 0.08],
			[1.45, bottom],
			[0.001, bottom]
		]
			// A lathe faces outward when its outline runs upward.
			.reverse()
			.map(([r, y]) => new THREE.Vector2(r, y));
		const b = new Batch();
		b.add(new THREE.LatheGeometry(profile, 48), m.cream, { p: [sx, 0, 0] });
		b.add(new THREE.TorusGeometry(0.8, 0.075, 12, 56), m.steel, { p: [sx, COLLAR_Y, 0], r: [Math.PI / 2, 0, 0] });
		b.add(new THREE.TorusGeometry(1.0, 0.07, 12, 56), m.steel, { p: [sx, -5.38, 0], r: [Math.PI / 2, 0, 0] });
		this.group.add(b.build('stem'));

		const base = machine({ w: 8.2, h: 1.5, d: 6.2, finish: 'cream', name: 'The model', signH: 0.56, vent: false });
		base.position.set(sx, -BRAIN_FOOT, 0);
		this.group.add(base);

		const isl = islandAt(21, 15, 0.8);
		isl.position.set(sx, -BRAIN_FOOT, 0);
		this.group.add(isl);
		shadowOn(this.group, sx, -BRAIN_FOOT, 0, 8.7, 6.7, 0.46);
		const shade = createCastShadow(23, 17, 0.2);
		shade.position.set(sx, -BRAIN_FOOT - 9, 0);
		this.group.add(shade);
	}

	/** Press it and it gets to thinking. */
	excite() {
		this.excited = 1;
	}

	/** Busy while tokens pour in, otherwise ticking over. */
	update(T: number, time: number) {
		const now = performance.now();
		const dt = Math.min(0.05, (now - this.lastUpdate) / 1000);
		this.lastUpdate = now;
		this.excited *= Math.exp(-dt * 0.9);
		this.extraTurn += this.excited * dt * 7;
		const busy = smooth(seg(T, 7.2, 7.7));
		// The waves travel on with time and with the story, and race when it thinks hard.
		waves.uWaveTime.value = time * 0.7 + T * 1.6 + this.extraTurn * 1.4;
		waves.uWaveGain.value = 0.6 + busy * 0.8 + this.excited * 1.6;
		this.lamps.forEach((lamp, i) => {
			const beat = Math.sin(time * 1.6 - i * 0.9) * 0.5 + 0.5;
			lamp.set(color.amber, 0.12 + beat * (0.2 + busy * 0.5));
		});
	}
}
