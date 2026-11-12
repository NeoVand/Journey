import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { asset } from '$app/paths';
import { hitBall } from '../poke';
import { Batch } from '../kit/batch';
import { extrude, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { clamp, hash, lerp, seg, smooth } from '../kit/math';
import { islandAt, machine, shadowOn } from '../kit/machines';
import { createCastShadow } from './island';

/*
 * The model, as Neo Mohsenvand designed it: a brain built like a machine. Fat, glossy cushions in yellow and blue lie
 * pressed together over a dark core, and where they part the works show through: chrome pipes with light strips, copper
 * coils, blocks of electronics with lit bars, little parts in every dark gap, rows of cyan lights on the blue, and two
 * eyes in each side that turn to look at the reader. The cerebellum is two drums wound in copper; the brainstem a chrome
 * conduit down into the pedestal, with a chrome arm up into each half and a lit spine between them.
 * Long axis along X with the front at +X, the fissure in the plane z = 0, and the near side facing +Z.
 * Origin at the middle of the brain.
 *
 * It works as it stands there. Each pass is the model reading what came in and writing one token: a front of light starts
 * under the intake, rolls down over both halves and gathers into the brainstem, and as it goes by the cushions swell like
 * muscle, the lights flare, the coils run hot, and the collar flashes when the token is written. At rest it breathes and
 * ticks over with a quiet pass now and then; as the tokens pour in, it beats once a second, a token a pass.
 *
 * It is built from the drawing itself. The core is the outer skin of the left hemisphere of a 25-year-old's MRI, from the
 * UCSF Neuroscape lab's Glass Brain, which they gave to the public domain (NIH 3D, 3DPX-000757), calmed and bent until
 * its outline is the drawing's: from the side, from above and from the front, at the page's size, with the stem as long
 * as drawn. Over it lies one even pattern of stripes, grown on the skin along the way each drawing's bands run and held
 * to the drawings' own yellow and blue, firmest where the side view shows it; each stripe is raised into a round cushion,
 * and the channels between them are the core's floor. The machines, eyes and cyan rows sit where the drawing has them,
 * the cushions stopping short of them, and more fill the widest gaps. The near half is the far half's mirror. The file
 * also carries a light copy of the core, never drawn, that the waves and passes measure their way over. See
 * static/models/brain.glb, packed with gltfpack.
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

/** The cushions' two colours, sampled from the design, and the floor of the channels between them. */
const skin = {
	uYellow: { value: new THREE.Color('#ffb200') },
	uBlue: { value: new THREE.Color('#06348c') },
	uFloor: { value: new THREE.Color('#16181d') }
};

/** How fast a pass runs over the brain, in its own units a second: from the intake to the collar in about a second and a half. */
const PASS_SPEED = 9;
/** Where the brainstem comes out from between the halves, underneath. */
const STEM_TOP: [number, number, number] = [-0.2, -2.0, 0];
/** Which way an eye looks in its own frame. */
const FORWARD = new THREE.Vector3(0, 0, 1);
/** Where every pass starts: under the intake, on the crest. */
const INTAKE: [number, number, number] = [0.3, 4.0, -0.4];

/**
 * The brain at work, shared by every material it wears and every copy a visit makes of one. A pass is the model reading
 * what came in and writing one token: it starts under the intake, rolls down over both halves and gathers into the
 * brainstem, and every part lights or swells as it goes by. Up to four are under way at once, each with its age in
 * seconds (below zero, none) and its strength. The current in the lights runs on with `uFlow`; the cushions breathe with
 * `uBreath`.
 */
const life = {
	uPassAge: { value: new THREE.Vector4(-1, -1, -1, -1) },
	uPassGain: { value: new THREE.Vector4() },
	uFlow: { value: 0 },
	uBreath: { value: 0 }
};

const PASS = /* glsl */ `
uniform vec4 uPassAge;
uniform vec4 uPassGain;
uniform float uFlow;
uniform float uBreath;
// The passes at a point this far from the intake, in the waves' own style: x the thin white-hot front going by, y the
// soft halo round it, z the short afterglow it leaves behind.
vec3 passAt(float d) {
	vec3 o = vec3(0.0);
	for (int i = 0; i < 4; i++) {
		if (uPassAge[i] < 0.0) continue;
		float x = d - uPassAge[i] * ${PASS_SPEED.toFixed(1)};
		o += uPassGain[i] * vec3(exp(-x * x * 16.0), exp(-x * x * 1.6), x < 0.0 ? exp(x * 1.1) : 0.0);
	}
	return o;
}
`;

/**
 * What the file holds: one half of each finish, mirrored for the other, and what stands in the middle. The shell is the
 * cushions and the channels' floor in one skin; the guide, a light copy of the core beneath, is only measured over. The
 * eyes come apart, each in its own frame (where it sits, with Z the way it looks), so they can turn.
 */
type Half = 'shell' | 'guide' | 'chrome' | 'copper' | 'amber' | 'dark' | 'cyan';
type Middle = 'chrome' | 'amber' | 'dark';
type EyePart = 'dark' | 'amber' | 'chrome';
type Parts = {
	half: Partial<Record<Half, THREE.BufferGeometry>>;
	middle: Partial<Record<Middle, THREE.BufferGeometry>>;
	eyes: { at: THREE.Matrix4; part: Partial<Record<EyePart, THREE.BufferGeometry>> }[];
};
let parts: Parts | null = null;

/**
 * Plain float positions (and colours, if any) in the brain's own frame, or in an eye's if it's given: the file packs
 * them, and keeps each part's placement on its node.
 */
function unpack(mesh: THREE.Mesh, frame?: THREE.Matrix4) {
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
	g.applyMatrix4(frame ? frame.clone().invert().multiply(mesh.matrixWorld) : mesh.matrixWorld);
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
	return { half: { shell: g }, middle: {}, eyes: [] };
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
	const out = new Float32Array(n * sets.length).fill(-1);
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
		for (let v = 0; v < n; v++) if (Number.isFinite(dist[v])) out[v * sets.length + f] = dist[v];
	});
	return out;
}

/**
 * The nearest point of the far half's skin to any point of the brain, and how far it is. A pass reaches a point as far
 * on as it has come at that nearest point, and then straight on from there: machinery in a channel takes the channel's
 * reach, a cushion the core's beneath it, and the brainstem, below it all, is reached last. The near half is the far half's mirror,
 * so its points ask about their mirror image.
 */
function nearest(skin: ArrayLike<number>) {
	// The skin's points sorted into a grid of small cells, each cell's points one after another.
	const cell = 0.3;
	const n = skin.length / 3;
	const lo = [Infinity, Infinity, Infinity];
	const hi = [-Infinity, -Infinity, -Infinity];
	for (let v = 0; v < n; v++)
		for (let k = 0; k < 3; k++) {
			lo[k] = Math.min(lo[k], skin[v * 3 + k]);
			hi[k] = Math.max(hi[k], skin[v * 3 + k]);
		}
	const size = [0, 1, 2].map((k) => Math.floor((hi[k] - lo[k]) / cell) + 1);
	const at = (i: number, j: number, k: number) => (i * size[1] + j) * size[2] + k;
	const home = (v: number) => at(...([0, 1, 2].map((k) => Math.floor((skin[v * 3 + k] - lo[k]) / cell)) as [number, number, number]));
	const start = new Int32Array(size[0] * size[1] * size[2] + 1);
	for (let v = 0; v < n; v++) start[home(v) + 1]++;
	for (let c = 0; c < start.length - 1; c++) start[c + 1] += start[c];
	const fill = start.slice();
	const items = new Int32Array(n);
	for (let v = 0; v < n; v++) items[fill[home(v)]++] = v;
	return (x: number, y: number, z: number) => {
		z = -Math.abs(z);
		const c = [x, y, z].map((q, k) => Math.floor((q - lo[k]) / cell));
		let best = -1;
		let near = Infinity;
		// Out ring by ring until a ring finds something, and one more, since a corner of the last can hide a nearer one; no
		// further than a few rings, which is as far as anything in the brain's channels is from its skin.
		for (let r = 0, last = 3; r <= last; r++) {
			for (let a = -r; a <= r; a++) {
				const i = c[0] + a;
				if (i < 0 || i >= size[0]) continue;
				for (let b = -r; b <= r; b++) {
					const j = c[1] + b;
					if (j < 0 || j >= size[1]) continue;
					for (let d = -r; d <= r; d++) {
						const k = c[2] + d;
						if (k < 0 || k >= size[2] || Math.max(Math.abs(a), Math.abs(b), Math.abs(d)) !== r) continue;
						const cc = at(i, j, k);
						for (let e = start[cc]; e < start[cc + 1]; e++) {
							const v = items[e];
							const q = (skin[v * 3] - x) ** 2 + (skin[v * 3 + 1] - y) ** 2 + (skin[v * 3 + 2] - z) ** 2;
							if (q < near) [near, best] = [q, v];
						}
					}
				}
			}
			if (best >= 0 && last === 3) last = r + 1;
		}
		return [best, Math.sqrt(near)] as const;
	};
}

/** Every vertex's reach, as an attribute the shaders read. */
function setReach(geo: THREE.BufferGeometry, at: (x: number, y: number, z: number) => number) {
	const p = geo.getAttribute('position');
	const out = new Float32Array(p.count);
	for (let i = 0; i < p.count; i++) out[i] = at(p.getX(i), p.getY(i), p.getZ(i));
	geo.setAttribute('pass', new THREE.BufferAttribute(out, 1));
	return geo;
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
		Object.assign(shader.uniforms, waves, skin, life);
		shader.vertexShader = shader.vertexShader
			.replace(
				'#include <common>',
				'#include <common>\nattribute vec3 look;\nattribute vec3 geo;\nattribute float pass;\nvarying vec3 vLook;\nvarying vec3 vGeo;\nvarying float vPass;\nvarying float vDepth;\n' + PASS
			)
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
				vLook = look;
				vGeo = geo;
				vPass = pass;
				{
					// The cushions breathe, and swell just behind each pass like a muscle at work; the channels' floor stays put.
					vec3 p = passAt(pass);
					float body = smoothstep(0.5, 0.75, look.y) * (0.35 + 0.65 * look.z);
					transformed += objectNormal * body * (0.03 * uBreath + 0.075 * p.y + 0.025 * min(p.z, 1.5));
				}`
			)
			.replace('#include <project_vertex>', '#include <project_vertex>\nvDepth = -mvPosition.z;');
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\nuniform float uWaveTime;\nuniform float uWaveGain;\nuniform vec3 uWaveColor;\nuniform vec3 uYellow;\nuniform vec3 uBlue;\nuniform vec3 uFloor;\nvarying vec3 vLook;\nvarying vec3 vGeo;\nvarying float vPass;\nvarying float vDepth;\n' +
					FRONT +
					PASS
			)
			// The colours are drawn here from smooth fields baked into the file, so every edge follows the cushion's true
			// outline across the triangles instead of stepping from corner to corner: which colour (x, a half at the middle of
			// each gap), how far into the cushion (y, a half at its edge) and how high it stands (z).
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
				{
					vec3 tone = mix(uBlue, uYellow, smoothstep(0.35, 0.65, vLook.x));
					// A little darker low down the walls, where the channels close in.
					tone *= mix(0.62, 1.0, smoothstep(0.0, 0.6, vLook.z));
					float w = max(0.025, vDepth * 0.0004);
					diffuseColor.rgb = mix(uFloor, tone, smoothstep(0.5 - w, 0.5 + w, vLook.y));
				}`
			)
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					float t = uWaveTime;
					vec3 w = front(vGeo.x, t, 6.5, vGeo.y * 0.8 - vGeo.z * 0.6) * (0.65 + 0.35 * sin(t * 0.31))
						+ front(vGeo.y, t * 0.82 + 1.7, 7.8, vGeo.z * 0.7 + vGeo.x * 0.5) * (0.5 + 0.5 * sin(t * 0.23 + 2.0))
						+ front(vGeo.z, t * 0.91 + 3.1, 7.2, vGeo.x * 0.6 - vGeo.y * 0.8) * (0.5 + 0.5 * sin(t * 0.27 + 4.1));
					// Full in the channels, a rim on the cushions' edges, nothing on their tops.
					float floorLight = 1.0 - smoothstep(0.45, 0.72, vLook.y);
					// The core burns nearly white; the halo and the afterglow stay in the wave's colour.
					vec3 hot = mix(uWaveColor, vec3(1.0), 0.55);
					totalEmissiveRadiance += uWaveGain * (hot * w.x + uWaveColor * (w.y + w.z)) * floorLight;
					// Each pass: a white-hot front down every channel with its halo and afterglow, and as it runs beneath a cushion, light
					// round the cushion's rim and through its skin.
					vec3 p = passAt(vPass);
					totalEmissiveRadiance += (hot * p.x * 2.2 + uWaveColor * (min(p.y, 1.2) * 0.35 + min(p.z, 1.5) * 0.15)) * floorLight;
					float rim = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.0);
					totalEmissiveRadiance += (hot * rim * (p.x * 1.6 + p.y * 0.5) + diffuseColor.rgb * p.y * 0.3) * (1.0 - floorLight);
				}`
			);
	}
}

/**
 * The lights: amber bars and strips, and the cyan rows on the blue. Current runs through them the way the thought
 * travels, in dashes that slide along a strip and chase down a row of bars, and each pass lights them up as it goes by.
 * Their colour and overall brightness stay the material's own, so the update can set them on a visit's copy as well.
 */
class Lit extends THREE.MeshStandardMaterial {
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, life);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float pass;\nvarying float vPass;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvPass = pass;');
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPass;\n' + PASS).replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `#include <emissivemap_fragment>
			{
				vec3 p = passAt(vPass);
				float dash = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin((vPass * 2.3 - uFlow) * 6.2832));
				totalEmissiveRadiance *= 0.3 + 0.7 * dash + 2.4 * p.x + 0.9 * p.y + 0.3 * min(p.z, 1.5);
			}`
		);
	}
}

/**
 * The metal: chrome, copper and the dark of the electronics. Each part swells a little as a pass goes through it, the way
 * a pipe does when something is pumped along it, and copper windings run hot, in bands that run along each coil.
 */
class Works extends THREE.MeshStandardMaterial {
	/** How hot it runs as a pass goes by: nothing for chrome and the electronics, 1 for copper. */
	heat = 0;
	copy(source: Works) {
		super.copy(source);
		this.heat = source.heat;
		return this;
	}
	customProgramCacheKey() {
		return `works-${this.heat}`;
	}
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, life);
		shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nattribute float pass;\nvarying float vPass;\n' + PASS).replace(
			'#include <begin_vertex>',
			'#include <begin_vertex>\nvPass = pass;\ntransformed += objectNormal * 0.035 * passAt(pass).y;'
		);
		if (!this.heat) return;
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vPass;\n' + PASS).replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `#include <emissivemap_fragment>
			{
				vec3 p = passAt(vPass);
				float wind = 0.5 + 0.5 * sin((vPass * 3.0 - uFlow * 1.3) * 6.2832);
				totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * (1.2 * p.y + 0.35 * min(p.z, 1.5)) * (0.55 + 0.45 * wind) * ${this.heat.toFixed(2)};
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
	/** Lit parts and how bright they are at rest: the bars and strips in amber, the rows on the blue in cyan. */
	private lights: { mesh: THREE.Mesh; rest: number; beat: number; flash?: boolean }[] = [];
	hit!: THREE.Mesh;
	private excited = 0;
	private extraTurn = 0;
	private lastTime: number | null = null;
	/** How far a pass has come when it reaches a point: see `nearest`. */
	private reach: (x: number, y: number, z: number) => number = () => 0;
	/** The passes under way: how long since each started (below zero, none) and how strong it is. */
	private passAge = [-1, -1, -1, -1];
	private passGain = [0, 0, 0, 0];
	/** How far it is to the next pass, as a share of the time between them. */
	private beat = 0.7;
	/** How far a pass has come when it reaches the collar, where the brainstem goes down into the pedestal. */
	private collarReach = 14;
	/**
	 * The eyes, each turning in its socket: where it looks now, where it means to look as an offset from the reader, when
	 * it next glances somewhere else. Its lit iris brightens with the other lights as it thinks.
	 */
	private eyes: { look: THREE.Object3D; glance: THREE.Vector3; next: number; seed: number }[] = [];
	/** The camera that last drew the brain: the eyes look at the reader. */
	private viewer: THREE.Camera | null = null;
	private finish!: { chrome: Works; copper: Works; dark: Works; amber: Lit; cyan: Lit };

	/** Fetches the brain, once, before the world is built. Without it the model still stands, as a plain egg. */
	static async load() {
		if (parts) return;
		try {
			const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(asset('models/brain.glb'));
			const found: Parts = { half: {}, middle: {}, eyes: [] };
			gltf.scene.updateMatrixWorld(true);
			gltf.scene.traverse((o) => {
				const mesh = o as THREE.Mesh;
				if (!mesh.isMesh) return;
				const node = [mesh, mesh.parent].find((n) => n && /^(half_|mid_|x?eye\d+_)/.test(n.name));
				const name = node?.name ?? '';
				const eye = /^x?eye(\d+)_(\w+)$/.exec(name);
				if (eye) {
					const e = (found.eyes[+eye[1]] ??= { at: node!.matrixWorld.clone(), part: {} });
					e.part[eye[2] as EyePart] = unpack(mesh, e.at);
				} else if (name.startsWith('half_')) found.half[name.slice(5) as Half] = unpack(mesh);
				else if (name.startsWith('mid_')) found.middle[name.slice(4) as Middle] = unpack(mesh);
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
			// It shines with its own waves: an emissive colour, at nothing, tells a visit not to light it up in amber as well.
			emissive: '#7fe6ff',
			emissiveIntensity: 0
		});
		const from = parts ?? standIn();
		// Everything that is the brain, under its name, so the conversation shows all of it and a visit lights all of it.
		const brain = new THREE.Group();
		brain.name = 'brain';
		this.group.add(brain);
		this.buildShell(brain, from.half.shell!, from.half.guide);
		this.buildWorks(brain, from);
		this.buildEyes(brain, from.eyes);
		this.buildSeat();
		this.buildStem();
	}

	/* ---- the cushions, both halves, and the floor of the channels between them ---- */
	private buildShell(brain: THREE.Group, shell: THREE.BufferGeometry, guide?: THREE.BufferGeometry) {
		// The waves run over the core (its light copy, the guide, if the file has one; it is never drawn): the three kinds,
		// and how far each point is from the intake, where every pass starts.
		const skin = guide ?? shell;
		const all = overSurface(skin, [...SOURCES, [INTAKE]]);
		const n = all.length / 4;
		const far = new Float32Array(n * 3);
		const pass = new Float32Array(n);
		for (let v = 0; v < n; v++) {
			[far[v * 3], far[v * 3 + 1], far[v * 3 + 2]] = [all[v * 4], all[v * 4 + 1], all[v * 4 + 2]];
			pass[v] = Math.max(0, all[v * 4 + 3]);
		}
		const near = nearest(skin.getAttribute('position').array);
		// Below the skin's reach, the brainstem and its arms: a pass gets there by way of the stem's top.
		const [top, topGap] = near(...STEM_TOP);
		const topReach = top < 0 ? 0 : pass[top] + topGap;
		this.reach = (x, y, z) => {
			const [j, d] = near(x, y, z);
			return j < 0 ? topReach + Math.hypot(x - STEM_TOP[0], y - STEM_TOP[1], z - STEM_TOP[2]) : pass[j] + d;
		};
		skin.setAttribute('geo', new THREE.BufferAttribute(far, 3));
		skin.setAttribute('pass', new THREE.BufferAttribute(pass, 1));
		if (guide) {
			// Each point of the skin takes its waves from the core beneath it, and every pass a moment after the core.
			const p = shell.getAttribute('position');
			const geo = new Float32Array(p.count * 3);
			const reach = new Float32Array(p.count);
			for (let i = 0; i < p.count; i++) {
				const [j, d] = near(p.getX(i), p.getY(i), p.getZ(i));
				for (let k = 0; k < 3; k++) geo[i * 3 + k] = far[j * 3 + k];
				reach[i] = pass[j] + d;
			}
			shell.setAttribute('geo', new THREE.BufferAttribute(geo, 3));
			shell.setAttribute('pass', new THREE.BufferAttribute(reach, 1));
		}
		const half = shell;
		const other = mirrored(half);
		// The near half takes the same three distances in another order, so the two halves never pulse alike.
		const g = other.getAttribute('geo') as THREE.BufferAttribute;
		for (let i = 0; i < g.count; i++) g.setXYZ(i, g.getY(i), g.getZ(i), g.getX(i));
		const geo = mergeGeometries([half, other]);
		other.dispose();
		// The file keeps the cushions' fields in the colour channels: which colour, how far into the cushion, how high.
		geo.setAttribute('look', geo.getAttribute('color'));
		geo.deleteAttribute('color');
		geo.computeVertexNormals();
		geo.computeBoundingSphere();
		const mesh = new THREE.Mesh(geo, this.tissue);
		mesh.name = 'cushions';
		mesh.onBeforeRender = (_r, _s, camera) => (this.viewer = camera);
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
		const chrome = new Works({ color: '#b4bcc8', metalness: 1, roughness: 0.22 });
		const copper = new Works({ color: '#d98a55', metalness: 1, roughness: 0.3 });
		copper.heat = 1;
		const dark = new Works({ color: '#1d2027', metalness: 0.55, roughness: 0.42 });
		const amber = new Lit({ color: '#3a2a12', roughness: 0.35, emissive: '#ffa630', emissiveIntensity: 2 });
		const cyan = new Lit({ color: '#0d2a33', roughness: 0.3, emissive: '#5fe8ff', emissiveIntensity: 2 });
		const finish = { chrome, copper, dark, amber, cyan };
		this.finish = finish;
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
		// Every part knows how far a pass has come when it gets there; the near half's are its mirror's.
		const reach = (g: THREE.BufferGeometry | undefined) => g && setReach(g, this.reach);
		const both = (g: THREE.BufferGeometry | undefined) => (g ? [setReach(g, this.reach), mirrored(g)] : []);
		add([...both(from.half.chrome), reach(from.middle.chrome)], 'chrome', 'works');
		add([...both(from.half.copper)], 'copper', 'coils');
		add([...both(from.half.dark), reach(from.middle.dark)], 'dark', 'electronics');
		add([...both(from.half.amber), reach(from.middle.amber)], 'amber', 'lights');
		add([...both(from.half.cyan)], 'cyan', 'leds');
	}

	/*
	 * ---- the eyes: a chrome housing that stays put, and in its bore a glass dome that is part of one sphere, with the lit
	 * iris lying on it. The dome turns about that sphere's middle, so it only ever moves within itself: nothing passes
	 * through the housing, and at its furthest turn the iris is still well inside the bore. ----
	 */
	private buildEyes(brain: THREE.Group, eyes: Parts['eyes']) {
		const glass = new THREE.MeshPhysicalMaterial({ color: '#05070b', roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 });
		const mirror = new THREE.Matrix4().makeScale(1, 1, -1);
		eyes.forEach((eye, i) => {
			for (const side of [0, 1]) {
				// The near half's eye is the far one's mirror image, frame and all.
				const frame = new THREE.Object3D();
				frame.matrixAutoUpdate = false;
				frame.matrix.copy(eye.at);
				if (side) frame.matrix.premultiply(mirror);
				const look = new THREE.Group();
				frame.add(look);
				const centre = new THREE.Vector3().setFromMatrixPosition(frame.matrix);
				const reach = this.reach(centre.x, centre.y, centre.z);
				const entry: (typeof this.eyes)[number] = { look, glance: new THREE.Vector3(), next: 0, seed: i * 2 + side + 1 };
				for (const name of ['dark', 'chrome', 'amber'] as const) {
					const src = eye.part[name];
					if (!src) continue;
					const geo = side ? src.clone() : src;
					geo.setAttribute('pass', new THREE.BufferAttribute(new Float32Array(geo.getAttribute('position').count).fill(reach), 1));
					geo.computeVertexNormals();
					const mesh = new THREE.Mesh(geo, name === 'dark' ? glass : this.finish[name]);
					mesh.name = 'eye';
					mesh.castShadow = name !== 'amber';
					look.add(mesh);
					if (name === 'amber') {
						this.lights.push({ mesh, rest: 1.8, beat: 0.3 + i });
					}
				}
				brain.add(frame);
				this.eyes.push(entry);
			}
		});
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
		// It flashes as each pass comes down the brainstem: the token is written.
		this.lights.push({ mesh: glow, rest: 1.4, beat: 0.6, flash: true });
		this.collarReach = this.reach(sx, COLLAR_Y, 0);
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

	/** Starts a pass from the intake, in a free place or the oldest one's. */
	private startPass(gain: number) {
		let slot = this.passAge.indexOf(-1);
		if (slot < 0) slot = this.passAge.indexOf(Math.max(...this.passAge));
		this.passAge[slot] = 0;
		this.passGain[slot] = gain;
	}

	/** Press it and it gets to thinking: a strong pass at once, and its heart races for a while. */
	excite() {
		this.excited = 1;
		this.startPass(1.35);
		this.beat = 0;
	}

	/** Busy while tokens pour in, otherwise ticking over. */
	update(T: number, time: number) {
		const dt = this.lastTime === null ? 0 : clamp(time - this.lastTime, 0, 0.1);
		this.lastTime = time;
		this.excited *= Math.exp(-dt * 0.9);
		this.extraTurn += this.excited * dt * 7;
		const busy = smooth(seg(T, 7.2, 7.7));
		const drive = Math.max(busy, this.excited);
		// The heartbeat: at rest a quiet pass every few seconds; as the tokens pour in, one a second, a token a pass.
		this.beat += dt / lerp(5.5, 1.05, drive);
		if (this.beat >= 1) {
			this.beat %= 1;
			this.startPass(0.3 + 0.7 * drive);
		}
		let flash = 0;
		for (let i = 0; i < 4; i++) {
			if (this.passAge[i] < 0) continue;
			this.passAge[i] += dt;
			if (this.passAge[i] * PASS_SPEED > this.collarReach + 8) {
				this.passAge[i] = -1;
				this.passGain[i] = 0;
				continue;
			}
			const x = this.collarReach - this.passAge[i] * PASS_SPEED;
			flash += this.passGain[i] * Math.exp(-x * x * 0.3);
		}
		life.uPassAge.value.fromArray(this.passAge);
		life.uPassGain.value.fromArray(this.passGain);
		life.uFlow.value += dt * (0.35 + 1.2 * busy + 1.5 * this.excited);
		life.uBreath.value = Math.sin(time * 1.25);
		// The waves travel on with time and with the story, and race when it thinks hard.
		waves.uWaveTime.value = time * 0.7 + T * 1.6 + this.extraTurn * 1.4;
		waves.uWaveGain.value = 0.35 + busy * 0.5 + this.excited * 1.0;
		// The lights breathe at rest, brighten as the tokens pour in, and flare when it's pressed. Each on whatever it wears now:
		// a visit dresses it in a copy of its material while the conversation talks about it.
		for (const light of this.lights) {
			const beat = Math.sin(time * 1.7 - light.beat) * 0.5 + 0.5;
			const level = light.rest * (0.75 + beat * 0.25) * (1 + busy * 0.5 + this.excited) + (light.flash ? flash * 5 : 0);
			for (const mat of (Array.isArray(light.mesh.material) ? light.mesh.material : [light.mesh.material]) as THREE.MeshStandardMaterial[]) mat.emissiveIntensity = level;
		}
		this.turnEyes(time, dt);
	}

	/** The eyes look at the reader, and glance away now and then and come back. */
	private turnEyes(time: number, dt: number) {
		const seen = this.viewer?.getWorldPosition(new THREE.Vector3());
		const dir = new THREE.Vector3();
		const turn = new THREE.Quaternion();
		for (const eye of this.eyes) {
			if (time >= eye.next) {
				const r = (k: number) => hash(eye.seed * 13.1 + Math.floor(time * 7) * 0.37 + k * 3.3);
				const away = r(1) < 0.3;
				eye.glance.set((r(2) - 0.5) * (away ? 1.1 : 0.2), (r(3) - 0.5) * (away ? 0.7 : 0.15), 0);
				eye.next = time + (away ? 0.5 + r(4) * 0.6 : 1.3 + r(5) * 2.4);
			}
			const frame = eye.look.parent!;
			if (seen) frame.worldToLocal(dir.copy(seen)).normalize();
			else dir.set(0, 0, 1);
			dir.add(eye.glance).normalize();
			// Never further round than the file's eyes were made for (TURN in its build): the iris stays inside the bore.
			const most = 0.26;
			if (Math.acos(clamp(dir.z, -1, 1)) > most) {
				const across = Math.hypot(dir.x, dir.y) || 1;
				dir.set((dir.x / across) * Math.sin(most), (dir.y / across) * Math.sin(most), Math.cos(most));
			}
			turn.setFromUnitVectors(FORWARD, dir);
			// A glance is quick, as an eye's is.
			eye.look.quaternion.slerp(turn, 1 - Math.exp(-dt * 14));
		}
	}
}
