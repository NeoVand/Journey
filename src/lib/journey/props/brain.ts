import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asset } from '$app/paths';
import { hitBall } from '../poke';
import { Batch } from '../kit/batch';
import { extrude, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { seg, smooth } from '../kit/math';
import { islandAt, machine, shadowOn } from '../kit/machines';
import { createCastShadow } from './island';

/*
 * The model, as Neo Mohsenvand designed it: a brain built like a machine. Glossy cushions in yellow and blue run in waves over each half,
 * the way a brain's folds do, and in the channels between them the works show through: chrome pipes with light strips,
 * copper coils, blocks of electronics with lit bars, rows of cyan lights on the blue, and an eye in each side. The
 * cerebellum is two drums wound in copper; the brainstem a chrome conduit down into the pedestal.
 * Long axis along X with the front at +X, the fissure in the plane z = 0, and the near side facing +Z.
 * Origin at the middle of the brain.
 *
 * Its shape is a real brain's. The far half was laid out in Blender over the left hemisphere of a 25-year-old's MRI, from
 * the UCSF Neuroscape lab's Glass Brain, which they gave to the public domain (NIH 3D, 3DPX-000757): its outer skin,
 * with the cushions running across it by distance from the crest, so they curl round the eye where the temporal lobe
 * swells. The near half is its mirror. See static/models/brain.glb, packed with gltfpack.
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

/** What the file holds: one half of each finish, mirrored for the other, and what stands in the middle. */
type Half = 'shell' | 'chrome' | 'copper' | 'amber' | 'dark' | 'cyan';
type Middle = 'chrome' | 'amber' | 'dark';
type Parts = { half: Partial<Record<Half, THREE.BufferGeometry>>; middle: Partial<Record<Middle, THREE.BufferGeometry>> };
let parts: Parts | null = null;

const smoothstep = (a: number, b: number, v: number) => smooth(seg(v, a, b));

/** Plain float positions (and colours, if any) in the brain's own frame: the file packs them, and keeps each part's placement on its node. */
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

/** The other half: the same, across the fissure, with every triangle wound the other way so it still faces out. */
function mirrored(g: THREE.BufferGeometry) {
	const m = g.clone();
	const p = m.getAttribute('position') as THREE.BufferAttribute;
	for (let i = 0; i < p.count; i++) p.setZ(i, -p.getZ(i));
	const index = m.getIndex()!;
	for (let i = 0; i < index.count; i += 3) {
		const b = index.getX(i + 1);
		index.setX(i + 1, index.getX(i + 2));
		index.setX(i + 2, b);
	}
	return m;
}

/** A plain stand-in, only if the file can't be had: half an egg of yellow cushion. */
function standIn(): Parts {
	const g = new THREE.SphereGeometry(1, 48, 32);
	g.deleteAttribute('normal');
	g.deleteAttribute('uv');
	g.scale(5.9, 3.6, 2.4).translate(0.2, 0, -2.5);
	g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count * 3).fill(1), 3));
	return { half: { shell: g }, middle: {} };
}

/**
 * Where the waves start on the far half, and so how far each point is from them over the surface: three sets, one for
 * each kind of wave. The first starts on the roof, where tokens come in, and at the top of the brainstem. The near half
 * is the far half's mirror, and takes the same three distances in another order, so the two halves never pulse alike.
 */
const SOURCES: [number, number, number][][] = [
	[
		[0.4, 3.9, -0.7],
		[-0.8, -1.6, -0.5]
	],
	[[5.4, 0.6, -2.2]],
	[
		[-4.6, 0.8, -2.6],
		[1.2, -2.6, -3.8]
	]
];

/**
 * How far each vertex is over the surface, down every crease and back over every fold, from the nearest of each set of
 * points: Dijkstra along the mesh's edges. Three distances to a vertex, -1 where a set can't reach it.
 */
function overSurface(geo: THREE.BufferGeometry, sets: [number, number, number][][]) {
	const p = (geo.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
	const tri = geo.getIndex()!.array;
	const n = p.length / 3;
	// Each vertex's neighbours, packed one after another: two for every triangle it's in.
	const start = new Uint32Array(n + 1);
	for (let i = 0; i < tri.length; i++) start[tri[i] + 1] += 2;
	for (let i = 0; i < n; i++) start[i + 1] += start[i];
	const fill = start.slice(0, n);
	const next = new Uint32Array(start[n]);
	for (let t = 0; t < tri.length; t += 3)
		for (let k = 0; k < 3; k++) {
			const a = tri[t + k];
			next[fill[a]++] = tri[t + ((k + 1) % 3)];
			next[fill[a]++] = tri[t + ((k + 2) % 3)];
		}
	const out = new Float32Array(n * 3).fill(-1);
	const dist = new Float64Array(n);
	const keys = new Float64Array(start[n] + n);
	const ids = new Uint32Array(start[n] + n);
	sets.forEach((points, f) => {
		dist.fill(Infinity);
		let size = 0;
		const push = (v: number, d: number) => {
			let i = size++;
			while (i > 0) {
				const up = (i - 1) >> 1;
				if (keys[up] <= d) break;
				keys[i] = keys[up];
				ids[i] = ids[up];
				i = up;
			}
			keys[i] = d;
			ids[i] = v;
		};
		const pop = () => {
			const v = ids[0];
			const d = keys[0];
			const lastK = keys[--size];
			const lastV = ids[size];
			let i = 0;
			for (;;) {
				let c = 2 * i + 1;
				if (c >= size) break;
				if (c + 1 < size && keys[c + 1] < keys[c]) c++;
				if (keys[c] >= lastK) break;
				keys[i] = keys[c];
				ids[i] = ids[c];
				i = c;
			}
			keys[i] = lastK;
			ids[i] = lastV;
			return [v, d];
		};
		for (const [x, y, z] of points) {
			let best = 0;
			let near = Infinity;
			for (let v = 0; v < n; v++) {
				const d = (p[v * 3] - x) ** 2 + (p[v * 3 + 1] - y) ** 2 + (p[v * 3 + 2] - z) ** 2;
				if (d < near) [near, best] = [d, v];
			}
			dist[best] = 0;
			push(best, 0);
		}
		while (size > 0) {
			const [v, d] = pop();
			if (d > dist[v]) continue;
			for (let e = start[v]; e < start[v + 1]; e++) {
				const u = next[e];
				const nd = d + Math.hypot(p[u * 3] - p[v * 3], p[u * 3 + 1] - p[v * 3 + 1], p[u * 3 + 2] - p[v * 3 + 2]);
				if (nd < dist[u]) {
					dist[u] = nd;
					push(u, nd);
				}
			}
		}
		// Walking along edges makes the fronts a little faceted; easing each distance towards its neighbours' rounds them.
		const eased = new Float64Array(n);
		for (let pass = 0; pass < 10; pass++) {
			for (let v = 0; v < n; v++) {
				if (!Number.isFinite(dist[v]) || dist[v] === 0) {
					eased[v] = dist[v];
					continue;
				}
				let sum = 0;
				let count = 0;
				for (let e = start[v]; e < start[v + 1]; e++) {
					const d = dist[next[e]];
					if (Number.isFinite(d)) {
						sum += d;
						count++;
					}
				}
				eased[v] = count ? dist[v] * 0.5 + (sum / count) * 0.5 : dist[v];
			}
			dist.set(eased);
		}
		for (let v = 0; v < n; v++) if (Number.isFinite(dist[v])) out[v * 3 + f] = dist[v];
	});
	return out;
}

/** One kind of wave, as light: its white-hot core, its halo and its afterglow, at a point this far over the surface from where it starts. */
const FRONT = /* glsl */ `
// One kind of wave at a point this far over the surface from where it starts. sd is how far ahead of the nearest front
// (behind it, negative), so a front is light on both sides, with nothing to cut at the far side of the gap between two.
vec3 front(float d, float t, float spacing, float along) {
	if (d < 0.0) return vec3(0.0);
	float u = (d - t) / spacing;
	float sd = (u - floor(u + 0.5)) * spacing;
	// Never thinner than about a pixel and a half wherever the camera is: derivatives glitter along the triangles' edges here.
	float w = max(0.07, vDepth * 0.0013);
	float core = exp(-(sd / w) * (sd / w));
	float halo = exp(-(sd / (w * 4.5)) * (sd / (w * 4.5)));
	float trail = sd < 0.0 ? exp(sd / 0.9) : 0.0;
	// A thin white-hot front with a soft halo and a short afterglow, brighter in some places along it than others.
	float swell = 0.55 + 0.45 * sin(along * 1.4 + t * 0.6);
	return vec3(core * 1.7, halo * 0.45, trail * 0.3) * swell;
}
`;

/**
 * The cushions and the floor of the channels between them, with waves of signal running through the channels. Each wave
 * spreads over the surface itself, so its front follows the channels' turns; three kinds start in different places,
 * travel at their own pace and swell and fade in turn, crossing as they go. They light the dark floor and only rim the
 * cushions' edges. A class of its own, so the copy a visit dresses the brain in keeps its waves.
 */
class Tissue extends THREE.MeshPhysicalMaterial {
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, waves);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float pad;\nattribute vec3 geo;\nvarying float vPad;\nvarying vec3 vGeo;\nvarying float vDepth;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPad = pad;\nvGeo = geo;')
			.replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = -mvPosition.z;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform float uWaveTime;\nuniform float uWaveGain;\nuniform vec3 uWaveColor;\nvarying float vPad;\nvarying vec3 vGeo;\nvarying float vDepth;\n' + FRONT)
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					float t = uWaveTime;
					vec3 w = front(vGeo.x, t, 6.5, vGeo.y * 0.8 - vGeo.z * 0.6) * (0.65 + 0.35 * sin(t * 0.31))
						+ front(vGeo.y, t * 0.82 + 1.7, 7.8, vGeo.z * 0.7 + vGeo.x * 0.5) * (0.5 + 0.5 * sin(t * 0.23 + 2.0))
						+ front(vGeo.z, t * 0.91 + 3.1, 7.2, vGeo.x * 0.6 - vGeo.y * 0.8) * (0.5 + 0.5 * sin(t * 0.27 + 4.1));
					// Full in the channels, a rim on the cushions' edges, nothing on their tops.
					float floorLight = 1.0 - smoothstep(0.15, 0.85, vPad);
					// The core burns nearly white; the halo and the afterglow stay in the wave's colour.
					vec3 hot = mix(uWaveColor, vec3(1.0), 0.55);
					totalEmissiveRadiance += uWaveGain * (hot * w.x + uWaveColor * (w.y + w.z)) * floorLight;
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

/** The cushions' two colours, from the design, and the floor between them. */
const YELLOW = new THREE.Color('#ffc824');
const BLUE = new THREE.Color('#2338b5');
const FLOOR = new THREE.Color('#16181d');

export class Brain {
	group = new THREE.Group();
	private tissue: Tissue;
	/** Lit parts and how bright they are at rest: the bars and strips in amber, the rows on the blue in cyan. */
	private lights: { mesh: THREE.Mesh; rest: number; beat: number }[] = [];
	hit!: THREE.Mesh;
	private excited = 0;
	private extraTurn = 0;
	private lastUpdate = 0;

	/** Fetches the brain, once, before the world is built. Without it the model still stands, as a plain egg. */
	static async load() {
		if (parts) return;
		try {
			const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset('models/brain.glb'));
			const found: Parts = { half: {}, middle: {} };
			gltf.scene.traverse((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh) return;
				const name = [mesh.name, mesh.parent?.name].find((n) => n?.startsWith('half_') || n?.startsWith('mid_'));
				if (name?.startsWith('half_')) found.half[name.slice(5) as Half] = unpack(mesh);
				else if (name?.startsWith('mid_')) found.middle[name.slice(4) as Middle] = unpack(mesh);
				mesh.geometry.dispose();
			});
			if (found.half.shell) parts = found;
		} catch (e) {
			console.warn('The brain could not be loaded, so it stands in as an egg.', e);
		}
	}

	constructor() {
		this.tissue = new Tissue({
			color: '#ffffff',
			roughness: 0.36,
			metalness: 0,
			clearcoat: 0.85,
			clearcoatRoughness: 0.14,
			vertexColors: true,
			// It shines with its own waves: an emissive colour, at nothing, tells a visit not to light it up in amber as well.
			emissive: '#7fe6ff',
			emissiveIntensity: 0
		});
		const from = parts ?? standIn();
		// Everything that is the brain, under its name, so the conversation shows all of it and a visit lights all of it.
		const brain = new THREE.Group();
		brain.name = 'brain';
		this.group.add(brain);
		this.buildShell(brain, from.half.shell!);
		this.buildWorks(brain, from);
		this.buildSeat();
		this.buildStem();
	}

	/* ---- the cushions, both halves, and the floor of the channels between them ---- */
	private buildShell(brain: THREE.Group, half: THREE.BufferGeometry) {
		const far = overSurface(half, SOURCES);
		const near = new Float32Array(far.length);
		for (let i = 0; i < far.length; i += 3) [near[i], near[i + 1], near[i + 2]] = [far[i + 1], far[i + 2], far[i]];
		half.setAttribute('geo', new THREE.BufferAttribute(far, 3));
		const other = mirrored(half);
		other.setAttribute('geo', new THREE.BufferAttribute(near, 3));
		const geo = mergeGeometries([half, other]);
		other.dispose();
		const baked = geo.getAttribute('color');
		const count = baked.count;
		const tint = new Float32Array(count * 3);
		const pads = new Float32Array(count);
		const c = new THREE.Color();
		for (let i = 0; i < count; i++) {
			// Red says which colour the cushion is, green how much this point is cushion rather than floor.
			const pad = smoothstep(0.1, 0.9, baked.getY(i));
			c.copy(baked.getX(i) > 0.5 ? YELLOW : BLUE).lerp(FLOOR, 1 - pad);
			c.toArray(tint, i * 3);
			pads[i] = pad;
		}
		geo.setAttribute('color', new THREE.BufferAttribute(tint, 3));
		geo.setAttribute('pad', new THREE.BufferAttribute(pads, 1));
		geo.computeVertexNormals();
		geo.computeBoundingSphere();
		const mesh = new THREE.Mesh(geo, this.tissue);
		mesh.name = 'cushions';
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		brain.add(mesh);

		// The pointer presses the brain: a ball round both halves.
		const round = geo.boundingSphere!;
		this.hit = hitBall(round.radius * 0.92);
		this.hit.position.copy(round.center);
		this.group.add(this.hit);
	}

	/* ---- what shows in the channels, the eyes, the copper cerebellum and the chrome brainstem ---- */
	private buildWorks(brain: THREE.Group, from: Parts) {
		const chrome = new THREE.MeshStandardMaterial({ color: '#b4bcc8', metalness: 1, roughness: 0.22 });
		const copper = new THREE.MeshStandardMaterial({ color: '#d98a55', metalness: 1, roughness: 0.3 });
		const dark = new THREE.MeshStandardMaterial({ color: '#1d2027', metalness: 0.55, roughness: 0.42 });
		const amber = new THREE.MeshStandardMaterial({ color: '#3a2a12', roughness: 0.35, emissive: '#ffa630', emissiveIntensity: 2 });
		const cyan = new THREE.MeshStandardMaterial({ color: '#0d2a33', roughness: 0.3, emissive: '#5fe8ff', emissiveIntensity: 2 });
		const finish = { chrome, copper, dark, amber, cyan };
		const add = (geos: (THREE.BufferGeometry | undefined)[], name: keyof typeof finish, label: string) => {
			const list = geos.filter((g): g is THREE.BufferGeometry => !!g);
			if (!list.length) return;
			const geo = list.length > 1 ? mergeGeometries(list.map((g) => (g.deleteAttribute('color'), g))) : list[0];
			geo.computeVertexNormals();
			const mesh = new THREE.Mesh(geo, finish[name]);
			mesh.name = label;
			mesh.castShadow = name !== 'amber' && name !== 'cyan';
			mesh.receiveShadow = true;
			brain.add(mesh);
			if (name === 'amber') this.lights.push({ mesh, rest: 1.6, beat: 0 });
			if (name === 'cyan') this.lights.push({ mesh, rest: 1.8, beat: 1.7 });
		};
		const both = (g: THREE.BufferGeometry | undefined) => (g ? [g, mirrored(g)] : []);
		add([...both(from.half.chrome), from.middle.chrome], 'chrome', 'works');
		add([...both(from.half.copper)], 'copper', 'coils');
		add([...both(from.half.dark), from.middle.dark], 'dark', 'electronics');
		add([...both(from.half.amber), from.middle.amber], 'amber', 'lights');
		add([...both(from.half.cyan)], 'cyan', 'leds');
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
		// A ring of light round the collar, where the brainstem goes in.
		const glow = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 8, 56), new THREE.MeshStandardMaterial({ color: '#3a2a12', emissive: '#ffa630', emissiveIntensity: 2 }));
		glow.position.set(sx, COLLAR_Y + 0.05, 0);
		glow.rotation.x = Math.PI / 2;
		this.group.add(glow);
		this.lights.push({ mesh: glow, rest: 1.4, beat: 0.6 });
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
		// The lights breathe at rest, brighten as the tokens pour in, and flare when it's pressed. Each on whatever it wears now:
		// a visit dresses it in a copy of its material while the conversation talks about it.
		for (const light of this.lights) {
			const beat = Math.sin(time * 1.7 - light.beat) * 0.5 + 0.5;
			const level = light.rest * (0.6 + beat * 0.4) * (1 + busy * 0.6 + this.excited * 1.2);
			for (const mat of (Array.isArray(light.mesh.material) ? light.mesh.material : [light.mesh.material]) as THREE.MeshStandardMaterial[]) mat.emissiveIntensity = level;
		}
	}
}
