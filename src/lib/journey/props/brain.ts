import * as THREE from 'three';
import { hitBall } from '../poke';
import { Batch } from '../kit/batch';
import { mats } from '../kit/materials';
import { clamp, hash, lerp, outBack, seg, smooth } from '../kit/math';
import { islandAt, machine, shadowOn } from '../kit/machines';
import { createCastShadow } from './island';
import { between, NOTCHES, PART, under, type Hose } from '../brain/chassis';
import { DIP, LOBE, RECESS } from '../brain/cerebellum';
import { FISSURE } from '../brain/shell';
import { core as buildCoreMesh } from '../brain/core';
import { BALLS, GYRI, HOSE, MACHINES, PORT, ROWS } from '../brain/design';

import { LIFT, PASS_SPEED, RISE_GLSL } from '../brain/motion';
import { solve } from '../brain/solve';
import { build, EYE_TURN, rows, type EyeBuilt, type Finish } from '../brain/works';

/*
 * The model, as Neo Mohsenvand designed it: a brain built like a machine. Two halves, mirror images, stand either side
 * of a deep fissure. Each is a dark core covered in fat, glossy cushions of yellow and blue that flow over it in long
 * S-curves, and where the cushions part the works show: chrome pipes with lit sleeves, copper coils, blocks of
 * electronics with lit bars, rows of cyan lights let into the blue, and two eyes that turn to look at the reader.
 * Long axis along X with the front at +X, the fissure in the plane z = 0, and the near side facing +Z.
 * Origin at the middle of the brain.
 *
 * Nothing here is sculpted. The core is an equation (brain/shell.ts). The cushions are laid out on it by the drawing's
 * own lines, and each machine is drawn where the drawing has it and then settles into the pocket the cushions leave
 * (brain/design.ts). How far each cushion reaches is solved, so that every gap is the same, every machine has its
 * clearance, every edge is a smooth curve, and the two halves face each other across the fissure with flat walls
 * (brain/solve.ts). The machines are built from the same numbers their pockets were cut by (brain/machines.ts,
 * brain/works.ts); the eyes stand in low chrome dishes that run out under the cushions, and the intake at the crown, in
 * the fissure, has a saddle of its own on each half (brain/chassis.ts). One half is built; the other is the same
 * geometry seen in a mirror. A test builds it all and measures every gap, at rest and through every motion.
 *
 * It works as it stands there. Each pass is the model reading what came in and writing one token: it starts under the
 * intake and rolls down over both halves to the brainstem, and as it goes by each plate of each cushion rises a little
 * on its own axis, with light under it, and settles back on its seat; the coils turn, the lights run. A plate is rigid
 * and moves only along the core's normal at its middle, and the core is convex, so a rising plate can only draw away
 * from its neighbours: nothing ever meets.
 */

/** How tall the intake stands: from its seat, deep in the fissure where its throat ends, to its rim at the crown. */
export const INTAKE_RISE = 1.45;
/** Height of the intake's seat above the brain's centre. */
export const BRAIN_SEAT = PORT.rim - INTAKE_RISE;
/** The bottom of the intake's throat: how far above the seat its floor is, and the throat's radius there. */
export const INTAKE_WELL = { floor: PORT.floor - BRAIN_SEAT + 0.012, r: PORT.bore - 0.16 };

/** The stem and pedestal go down this far below the brain's centre, to the island's top. */
export const BRAIN_FOOT = 7.5;

/** Where the brainstem comes down into its collar on the pedestal. */
const STEM_X = -1.4;
/** The collar the brainstem goes down into, on top of the pedestal's neck. */
const COLLAR_Y = -4.66;

/** The cushions' two colours, sampled from the design, and the dark they stand on. */
const skin = {
	uYellow: { value: new THREE.Color('#ffb200') },
	uBlue: { value: new THREE.Color('#06348c') },
	uFoot: { value: new THREE.Color('#0d0f14') }
};

/** The core's ribs are this far apart. */
const RIB = 0.13;

/** How far a pass has come when it has gone all the way round to the underside. */
const ROUND = 14.4;

/**
 * The brain at work, shared by every material it wears and every copy a visit makes of one. A pass is the model reading
 * what came in and writing one token. Up to four are under way at once, each with its age in seconds (below zero, none)
 * and its strength. The coils have turned through `uTurn`, and the current in the lights runs on with `uFlow`.
 */
const life = {
	uPassAge: { value: new THREE.Vector4(-1, -1, -1, -1) },
	uPassGain: { value: new THREE.Vector4() },
	uTurn: { value: 0 },
	uFlow: { value: 0 }
};

const PASS = /* glsl */ `
uniform vec4 uPassAge;
uniform vec4 uPassGain;
uniform float uTurn;
uniform float uFlow;
${RISE_GLSL}
// The light of the passes at a point: x the thin white-hot front going by, y the glow it leaves behind.
vec2 glowAt(float d) {
	vec2 o = vec2(0.0);
	for (int i = 0; i < 4; i++) {
		if (uPassAge[i] < 0.0) continue;
		float x = d - uPassAge[i] * ${PASS_SPEED.toFixed(1)};
		o += uPassGain[i] * vec2(exp(-x * x * 30.0), x < 0.0 ? exp(x * 1.1) : exp(-x * x * 3.0));
	}
	return o;
}
`;

/** A plate rises along its own axis, as far as the passes that have reached it say. */
const RISE = `transformed += axis * (${LIFT.toFixed(3)} * liftAt(reach));`;

/** How far a pass has come when it reaches a point: over the brain from the crown, the further round the later. */
function reachOf(x: number, y: number, z: number) {
	// Round the brain from the crown, and then on down the brainstem.
	return Math.atan2(Math.hypot(x / 5.3, z / 4.3), (y - 0.45) / 3.5) * (ROUND / Math.PI) + Math.max(0, -2.7 - y);
}

/** Every vertex's reach, as an attribute the shaders read: its own, or one given for the whole part. */
function setReach(geo: THREE.BufferGeometry, fixed?: number) {
	const p = geo.getAttribute('position');
	const out = new Float32Array(p.count);
	for (let i = 0; i < p.count; i++) out[i] = fixed ?? reachOf(p.getX(i), p.getY(i), p.getZ(i));
	geo.setAttribute('reach', new THREE.BufferAttribute(out, 1));
	return geo;
}

/**
 * The cushions: glossy plates in yellow and blue, each on a dark foot. A plate is rigid: every point of it carries the
 * plate's own axis and how far a pass has come when it gets there, so the whole plate rises and settles as one, and
 * light shows under it as it rises. A class of its own, so the copy a visit dresses the brain in keeps its motion.
 */
class Tissue extends THREE.MeshPhysicalMaterial {
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, skin, life);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute vec3 axis;\nattribute vec3 look;\nvarying vec3 vLook;\nvarying float vLift;\n' + PASS)
			.replace(
				'#include <begin_vertex>',
				/* glsl */ `#include <begin_vertex>
				vLook = look;
				vLift = liftAt(look.z);
				transformed += axis * (${LIFT.toFixed(3)} * vLift);`
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nuniform vec3 uYellow;\nuniform vec3 uBlue;\nuniform vec3 uFoot;\nvarying vec3 vLook;\nvarying float vLift;')
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
				{
					vec3 tone = mix(uBlue, uYellow, step(0.5, vLook.x));
					// The foot is dark rubber, and so is the plate underneath.
					diffuseColor.rgb = mix(uFoot, tone, smoothstep(0.02, 0.04, vLook.y));
				}`
			)
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					// Whatever light it is given of its own, a visit's glow, it gives off in its own colour.
					totalEmissiveRadiance *= mix(uFoot, mix(uBlue, uYellow, step(0.5, vLook.x)), smoothstep(0.02, 0.04, vLook.y)) * 1.6;
					// Light shows under a plate as it rises: along the bottom of its foot, and from underneath.
					float low = 1.0 - smoothstep(0.0, 0.035, vLook.y);
					totalEmissiveRadiance += vec3(1.0, 0.72, 0.32) * low * min(vLift, 1.0) * 9.0;
				}`
			);
	}
}

/**
 * The metal and the glass: chrome, copper, the dark of the electronics. Copper runs hot as a pass goes by. A coil's
 * windings turn about the coil's own axis, each turn about the point of the axis it is wound on, which is how a spring
 * turns in a bent tube: it never leaves the space it already fills. What rides on a cushion rises with its plate.
 */
class Works extends THREE.MeshStandardMaterial {
	/** How hot it runs as a pass goes by: nothing for chrome and the electronics, 1 for copper. */
	heat = 0;
	wound = false;
	rides = false;
	copy(source: Works) {
		super.copy(source);
		this.heat = source.heat;
		this.wound = source.wound;
		this.rides = source.rides;
		return this;
	}
	customProgramCacheKey() {
		return `works-${this.heat}-${this.wound}-${this.rides}`;
	}
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, life);
		// About the axis through the hub: the part along the axis stays, the rest goes round. Its normals turn with it.
		const turnNormal = /* glsl */ `objectNormal = objectNormal * cos(uTurn) + cross(spin, objectNormal) * sin(uTurn) + spin * dot(spin, objectNormal) * (1.0 - cos(uTurn));`;
		const turnPoint = /* glsl */ `{
			vec3 r = transformed - hub;
			vec3 along = spin * dot(r, spin);
			vec3 across = r - along;
			transformed = hub + along + across * cos(uTurn) + cross(spin, across) * sin(uTurn);
		}`;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float reach;\nvarying float vReach;\n' + (this.wound ? 'attribute vec3 hub;\nattribute vec3 spin;\n' : '') + (this.rides ? 'attribute vec3 axis;\n' : '') + PASS)
			.replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\n' + (this.wound ? turnNormal : ''))
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvReach = reach;\n' + (this.wound ? turnPoint : '') + (this.rides ? RISE : ''));
		if (!this.heat) return;
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vReach;\n' + PASS).replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `#include <emissivemap_fragment>
			{
				vec2 g = glowAt(vReach);
				totalEmissiveRadiance += vec3(1.0, 0.36, 0.08) * (1.1 * g.x + 0.35 * min(g.y, 1.5)) * ${this.heat.toFixed(2)};
			}`
		);
	}
}

/**
 * The lights: amber bars and strips, and the cyan rows on the blue. Current runs through them in dashes, and each pass
 * lights them up as it goes by. Their colour and overall brightness stay the material's own, so the update can set them
 * on a visit's copy as well.
 */
class Lit extends THREE.MeshStandardMaterial {
	rides = false;
	copy(source: Lit) {
		super.copy(source);
		this.rides = source.rides;
		return this;
	}
	customProgramCacheKey() {
		return `lit-${this.rides}`;
	}
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, life);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float reach;\nvarying float vReach;\n' + (this.rides ? 'attribute vec3 axis;\n' : '') + PASS)
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvReach = reach;\n' + (this.rides ? RISE : ''));
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vReach;\n' + PASS).replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `#include <emissivemap_fragment>
			{
				vec2 g = glowAt(vReach);
				float dash = smoothstep(0.2, 0.8, 0.5 + 0.5 * sin((vReach * 2.3 - uFlow) * 6.2832));
				totalEmissiveRadiance *= 0.45 + 0.55 * dash + 2.2 * g.x + 0.6 * min(g.y, 1.5);
			}`
		);
	}
}

/**
 * The core: dark metal between the cushions, machined in fine ribs that run round it like a heat sink's, with a deeper
 * line every few. Each pass runs down its channels as a line of light, brightest in the grooves.
 */
class Core extends THREE.MeshStandardMaterial {
	onBeforeCompile(shader: THREE.WebGLProgramParametersWithUniforms) {
		Object.assign(shader.uniforms, life);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float reach;\nvarying float vReach;\nvarying vec3 vAt;')
			.replace('#include <begin_vertex>', '#include <begin_vertex>\nvReach = reach;\nvAt = position;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nvarying float vReach;\nvarying vec3 vAt;\nfloat vGroove;\n' + PASS)
			.replace(
				'#include <color_fragment>',
				/* glsl */ `#include <color_fragment>
				{
					// The recess under the back of the half, where the cerebellum sits up into the brain: the core is hollow there.
					if (vAt.z > ${(FISSURE + 0.004).toFixed(3)} && vAt.y < ${RECESS.top.toFixed(4)}) {
						vec2 q = (vAt.xz - vec2(${RECESS.x.toFixed(4)}, ${RECESS.z.toFixed(4)})) / vec2(${RECESS.a.toFixed(4)}, ${RECESS.b.toFixed(4)});
						if (dot(q, q) < 1.0) discard;
					}
					// Ribs across the brain's length, ${RIB} apart, each a flat land between two narrow grooves; every fifth groove is wider.
					float along = vAt.x / ${RIB.toFixed(3)};
					float wide = fwidth(along) * 1.2;
					float from = abs(fract(along) - 0.5);
					float nth = mod(floor(along), 5.0) < 0.5 ? 0.16 : 0.07;
					vGroove = 1.0 - smoothstep(nth, nth + wide + 0.04, 0.5 - from);
					// Far away the ribs are finer than a pixel: they melt into their average instead of shimmering.
					vGroove = mix(vGroove, 0.2, clamp(wide * 2.0 - 0.3, 0.0, 1.0));
					diffuseColor.rgb *= 1.0 - 0.62 * vGroove;
				}`
			)
			.replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.9, vGroove);')
			.replace(
				'#include <emissivemap_fragment>',
				/* glsl */ `#include <emissivemap_fragment>
				{
					vec2 g = glowAt(vReach);
					totalEmissiveRadiance += (vec3(0.7, 0.95, 1.0) * g.x * 1.5 + vec3(0.1, 0.6, 1.0) * min(g.y, 1.5) * 0.07) * (0.55 + 0.9 * vGroove);
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

/** Which way an eye looks in its own frame. */
const FORWARD = new THREE.Vector3(0, 0, 1);

export class Brain {
	group = new THREE.Group();
	hit!: THREE.Mesh;
	/** Lit parts and how bright they are at rest: the bars and strips in amber, the rows on the blue in cyan. */
	private lights: { mesh: THREE.Mesh; rest: number; beat: number }[] = [];
	private excited = 0;
	private lastTime: number | null = null;
	/** The passes under way: how long since each started (below zero, none) and how strong it is. */
	private passAge = [-1, -1, -1, -1];
	private passGain = [0, 0, 0, 0];
	/** How far it is to the next pass, as a share of the time between them. */
	private beat = 0.7;
	/**
	 * The eyes, each turning in its socket: where it looks now, where it means to look as an offset from the reader, when
	 * it next glances somewhere else.
	 */
	private eyes: { look: THREE.Object3D; glance: THREE.Vector3; next: number; seed: number }[] = [];
	/** The camera that last drew the brain: the eyes look at the reader. */
	private viewer: THREE.Camera | null = null;
	/** The blue of the cushions, for what is blue and is not one: the cerebellum's lids. */
	private blue = new THREE.MeshPhysicalMaterial({ color: skin.uBlue.value, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
	private drum!: { copper: THREE.BufferGeometry; dark: THREE.BufferGeometry };
	private finish: Record<Finish, THREE.Material>;
	/** The two halves, which draw apart along the fissure's pins, and how far apart they are now, 0 to 1. */
	private halves: THREE.Group[] = [];
	private apart = 0;
	/** The ratchet ring round the intake, and how many notches it has clicked round. */
	private ring = new THREE.Group();
	private notch = 0;
	private clicked = -1e9;
	/** When it was last pressed open. */
	private opened = -1e9;
	/** The cerebellum's two lobes, and how far they have dipped, 0 to 1. */
	private drums: THREE.Group[] = [];
	private dip = 0;
	/** The ring of light where the brainstem goes down into its collar: it flashes as each pass arrives. */
	private collar!: THREE.Mesh;

	constructor(hose: Hose = HOSE) {
		// Everything that is the brain, under its name, so the conversation shows all of it and a visit lights all of it.
		const brain = new THREE.Group();
		brain.name = 'brain';
		this.group.add(brain);
		this.finish = {
			chrome: new Works({ color: '#c3cad6', metalness: 1, roughness: 0.2 }),
			copper: new Works({ color: '#d98a55', metalness: 1, roughness: 0.3 }),
			dark: new Works({ color: '#1d2027', metalness: 0.55, roughness: 0.42 }),
			glass: new THREE.MeshPhysicalMaterial({ color: '#05070b', roughness: 0.08, metalness: 0.3, clearcoat: 1, clearcoatRoughness: 0.04 }),
			amber: new Lit({ color: '#3a2a12', roughness: 0.35, emissive: '#ffa630', emissiveIntensity: 2 }),
			cyan: new Lit({ color: '#0d2a33', roughness: 0.3, emissive: '#5fe8ff', emissiveIntensity: 2 })
		};
		// One half is built; the other is the same geometry seen in a mirror.
		const near = new THREE.Group();
		const far = new THREE.Group();
		far.scale.z = -1;
		brain.add(near, far);
		const { meshes, eyes } = this.buildHalf();
		for (const mesh of meshes) {
			near.add(mesh);
			const twin = new THREE.Mesh(mesh.geometry, mesh.material);
			twin.name = mesh.name;
			twin.castShadow = mesh.castShadow;
			twin.receiveShadow = mesh.receiveShadow;
			twin.onBeforeRender = mesh.onBeforeRender;
			far.add(twin);
			this.light(twin);
		}
		this.buildEyes(near, eyes, 1);
		this.buildEyes(far, eyes, 2);
		this.halves = [near, far];
		this.buildBetween(brain, hose);
		this.hit = hitBall(5.6);
		this.hit.position.set(0, 0.5, 0);
		this.group.add(this.hit);
		this.buildStem();
	}

	/** Notes a lit mesh, so its brightness can breathe. */
	private light(mesh: THREE.Mesh) {
		if (!(mesh.material instanceof Lit)) return;
		const cyan = mesh.material.emissive.b > mesh.material.emissive.r;
		this.lights.push({ mesh, rest: cyan ? 1.7 : 1.25, beat: (cyan ? 1.7 : 0) + this.lights.length * 0.7 });
	}

	/* ---- one half: the cushions, the core they stand on, and the works between them ---- */
	private buildHalf() {
		const solved = solve(GYRI, BALLS);
		const count = solved.rise.length;
		const look = new Float32Array(count * 3);
		const axis = new Float32Array(count * 3);
		const plateReach = solved.plates.map((p) => reachOf(p.at[0], p.at[1], p.at[2]));
		for (let i = 0; i < count; i++) {
			const plate = solved.plates[solved.plate[i]];
			look[i * 3] = plate.tone === 'yellow' ? 1 : 0;
			look[i * 3 + 1] = solved.rise[i];
			look[i * 3 + 2] = plateReach[solved.plate[i]];
			axis.set(plate.axis, i * 3);
		}
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(solved.position, 3));
		geo.setAttribute('look', new THREE.BufferAttribute(look, 3));
		geo.setAttribute('axis', new THREE.BufferAttribute(axis, 3));
		geo.setIndex(new THREE.BufferAttribute(solved.index, 1));
		geo.computeVertexNormals();
		// It rises along its axis in the shader, so its bounds are a little wider than its geometry says.
		geo.computeBoundingSphere();
		geo.boundingSphere!.radius += LIFT;
		const tissue = new Tissue({ color: '#ffffff', roughness: 0.26, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06 });
		const cushions = new THREE.Mesh(geo, tissue);
		cushions.name = 'cushions';
		cushions.onBeforeRender = (_r, _s, camera) => (this.viewer = camera);
		const meshes: THREE.Mesh[] = [cushions, this.buildCore()];

		// The works: every machine's parts by finish.
		const built = build(MACHINES);
		const add = (geo: THREE.BufferGeometry | null, material: THREE.Material, name: string) => {
			if (!geo) return;
			const mesh = new THREE.Mesh(geo, material);
			mesh.name = name;
			meshes.push(mesh);
		};
		for (const finish of ['chrome', 'copper', 'dark', 'glass', 'amber', 'cyan'] as const) {
			const g = built.parts.take(finish);
			if (g) add(setReach(g), this.finish[finish], finish === 'amber' ? 'lights' : finish === 'cyan' ? 'leds' : 'works');
		}
		if (built.coils) {
			const copper = (this.finish.copper as Works).clone();
			copper.wound = true;
			copper.heat = 1;
			add(setReach(built.coils), copper, 'coils');
		}
		// What rides on the cushions: the rows of lights let into the blue, each rising with its plate.
		const riding = new Map<Finish, THREE.BufferGeometry[]>();
		for (const part of rows(solved, ROWS)) {
			const g = part.geo.index ? part.geo.toNonIndexed() : part.geo;
			const n = g.getAttribute('position').count;
			const plate = solved.plates[part.plate];
			const ax = new Float32Array(n * 3);
			for (let i = 0; i < n; i++) ax.set(plate.axis, i * 3);
			g.setAttribute('axis', new THREE.BufferAttribute(ax, 3));
			setReach(g, plateReach[part.plate]);
			riding.set(part.finish, [...(riding.get(part.finish) ?? []), g]);
		}
		for (const [finish, list] of riding) {
			const material = (this.finish[finish] as Works | Lit).clone();
			material.rides = true;
			const g = new THREE.BufferGeometry();
			for (const name of ['position', 'normal', 'axis', 'reach']) {
				const size = list[0].getAttribute(name).itemSize;
				const all = new Float32Array(list.reduce((sum, part) => sum + part.getAttribute(name).count * size, 0));
				let at = 0;
				for (const part of list) {
					all.set(part.getAttribute(name).array, at);
					at += part.getAttribute(name).count * size;
				}
				g.setAttribute(name, new THREE.BufferAttribute(all, size));
			}
			add(g, material, finish === 'cyan' ? 'leds' : 'works');
		}
		// Under the half: its boss on the brainstem's axle, its collars on the keel's pins, its saddle round the intake, and the
		// cerebellum's brim, with its lights.
		const below = under();
		for (const finish of ['chrome', 'dark', 'cyan'] as const) add(setReach(below.parts.take(finish)!), this.finish[finish], finish === 'cyan' ? 'leds' : 'works');
		const lid = new THREE.Mesh(setReach(below.lid), this.blue);
		lid.name = 'cerebellum';
		meshes.push(lid);
		this.drum = below.drum;
		for (const mesh of meshes) {
			mesh.castShadow = !(mesh.material instanceof Lit);
			mesh.receiveShadow = true;
			this.light(mesh);
		}
		return { meshes, eyes: built.eyes };
	}

	/* ---- what holds the halves: the keel and its pins, the intake at the crown, the brainstem and its axle ---- */
	private buildBetween(brain: THREE.Group, hose: Hose) {
		const { parts, ring, pins } = between(hose);
		const add = (to: THREE.Object3D, geo: THREE.BufferGeometry | null, material: THREE.Material, name: string) => {
			if (!geo) return;
			const mesh = new THREE.Mesh(geo, material);
			mesh.name = name;
			mesh.castShadow = !(material instanceof Lit);
			mesh.receiveShadow = true;
			to.add(mesh);
			this.light(mesh);
		};
		for (const finish of ['chrome', 'dark', 'amber', 'cyan'] as const) add(brain, setReach(parts.take(finish)!), this.finish[finish], finish === 'amber' ? 'lights' : finish === 'cyan' ? 'leds' : 'works');
		add(brain, setReach(pins.take('chrome')!), this.finish.chrome, 'works');
		for (const finish of ['chrome', 'dark'] as const) add(this.ring, setReach(ring.take(finish)!, 0), this.finish[finish], 'intake');
		this.ring.position.x = PORT.x;
		brain.add(this.ring);
		// The cerebellum: each half's lobe of wound copper hangs under its half's brim, and dips as a pass comes down to it.
		for (const half of this.halves) {
			const drum = new THREE.Group();
			const reach = reachOf(LOBE.x, LOBE.top, LOBE.z);
			// The whole lobe warms at once: gently, so its windings still show.
			const copper = (this.finish.copper as Works).clone();
			copper.heat = 0.3;
			add(drum, setReach(this.drum.copper.clone(), reach), copper, 'cerebellum');
			add(drum, setReach(this.drum.dark.clone(), reach), this.finish.dark, 'cerebellum');
			half.add(drum);
			this.drums.push(drum);
		}
	}

	/* ---- the core: the shell itself and its flat inner face, with a notch at the crown for the intake (brain/core.ts) ---- */
	private buildCore() {
		const built = buildCoreMesh();
		const geo = new THREE.BufferGeometry();
		geo.setAttribute('position', new THREE.BufferAttribute(built.position, 3));
		geo.setAttribute('normal', new THREE.BufferAttribute(built.normal, 3));
		geo.setIndex(new THREE.BufferAttribute(built.index, 1));
		setReach(geo);
		const core = new THREE.Mesh(geo, new Core({ color: '#2a2e38', roughness: 0.42, metalness: 0.75 }));
		core.name = 'core';
		return core;
	}

	/*
	 * ---- the eyes: each ball in its own frame, turning about its own middle inside a housing whose bore is part of a
	 * sphere about that same middle, so it only ever moves within itself ----
	 */
	private buildEyes(half: THREE.Group, eyes: EyeBuilt[], side: number) {
		eyes.forEach((eye, i) => {
			const frame = new THREE.Object3D();
			frame.matrixAutoUpdate = false;
			frame.matrix.copy(eye.frame);
			const look = new THREE.Group();
			frame.add(look);
			const centre = new THREE.Vector3().setFromMatrixPosition(eye.frame);
			const reach = reachOf(centre.x, centre.y, centre.z);
			for (const [finish, geo] of Object.entries(eye.ball) as [Finish, THREE.BufferGeometry][]) {
				if (!geo.getAttribute('reach')) setReach(geo, reach);
				const mesh = new THREE.Mesh(geo, this.finish[finish]);
				mesh.name = 'eye';
				mesh.castShadow = finish !== 'amber';
				look.add(mesh);
				this.light(mesh);
			}
			half.add(frame);
			this.eyes.push({ look, glance: new THREE.Vector3(), next: 0, seed: i * 2 + side });
		});
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
		// A ring of light round the collar, where the brainstem goes in: it flashes as each pass comes down, a token written.
		this.collar = new THREE.Mesh(new THREE.TorusGeometry(0.66, 0.035, 8, 56), new THREE.MeshStandardMaterial({ color: '#3a2a12', emissive: '#ffa630', emissiveIntensity: 2 }));
		this.collar.position.set(sx, COLLAR_Y + 0.05, 0);
		this.collar.rotation.x = Math.PI / 2;
		this.group.add(this.collar);

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

	/** Starts a pass from the intake, in a free place or the oldest one's: the ratchet ring clicks round a notch, a token taken in. */
	private startPass(gain: number) {
		let slot = this.passAge.indexOf(-1);
		if (slot < 0) slot = this.passAge.indexOf(Math.max(...this.passAge));
		this.passAge[slot] = 0;
		this.passGain[slot] = gain;
		this.notch++;
		this.clicked = this.lastTime ?? 0;
	}

	/** Press it and it gets to thinking: the halves draw apart on their pins, a strong pass runs at once, and its heart races for a while. */
	excite() {
		this.excited = 1;
		this.startPass(1);
		this.beat = 0;
		this.opened = this.lastTime ?? 0;
	}

	/** Busy while tokens pour in, otherwise ticking over. */
	update(T: number, time: number) {
		const dt = this.lastTime === null ? 0 : clamp(time - this.lastTime, 0, 0.1);
		this.lastTime = time;
		this.excited *= Math.exp(-dt * 0.9);
		const busy = smooth(seg(T, 7.2, 7.7));
		const drive = Math.max(busy, this.excited);
		// The heartbeat: at rest a quiet pass every few seconds; as the tokens pour in, one a second, a token a pass.
		this.beat += dt / lerp(5.5, 1.05, drive);
		if (this.beat >= 1) {
			this.beat %= 1;
			this.startPass(0.45 + 0.55 * drive);
		}
		for (let i = 0; i < 4; i++) {
			if (this.passAge[i] < 0) continue;
			this.passAge[i] += dt;
			if (this.passAge[i] * PASS_SPEED > ROUND + 30) {
				this.passAge[i] = -1;
				this.passGain[i] = 0;
			}
		}
		life.uPassAge.value.fromArray(this.passAge);
		life.uPassGain.value.fromArray(this.passGain);
		life.uFlow.value += dt * (0.35 + 1.2 * busy + 1.5 * this.excited);
		// The coils turn slowly at rest, and each pass gives them a push that dies away; the cerebellum's lobes dip with it.
		let push = 0;
		let flash = 0;
		for (let i = 0; i < 4; i++) {
			if (this.passAge[i] < 0) continue;
			push += this.passGain[i] * Math.exp(-this.passAge[i] * 1.6);
			const x = ROUND + 1.9 - this.passAge[i] * PASS_SPEED;
			flash += this.passGain[i] * Math.exp(-x * x * 0.3);
		}
		life.uTurn.value += dt * (0.2 + 5.5 * push);
		this.dip += (Math.min(1, push) - this.dip) * (1 - Math.exp(-dt * 9));
		for (const drum of this.drums) drum.position.y = -DIP * this.dip;
		// The ratchet ring clicks round to its notch: quickly, a little past it, and back.
		const click = clamp((time - this.clicked) / 0.2);
		this.ring.rotation.y = ((this.notch - 1 + outBack(click, 2.4)) * Math.PI * 2) / NOTCHES;
		// The halves: closed at rest, a little apart while the tokens pour in, and wide for a moment when it is pressed.
		const since = time - this.opened;
		const pressed = since < 0 ? 0 : outBack(clamp(since / 0.34), 1.2) * (1 - smooth(seg(since, 1.05, 1.7)));
		const want = Math.max(0.3 * busy, pressed);
		this.apart = since >= 0 && since < 1.7 ? want : this.apart + (want - this.apart) * (1 - Math.exp(-dt * 6));
		this.halves[0].position.z = PART * this.apart;
		this.halves[1].position.z = -PART * this.apart;
		(this.collar.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.4 + flash * 6;
		// The lights breathe at rest, brighten as the tokens pour in, and flare when it's pressed. Each on whatever it wears now:
		// a visit dresses it in a copy of its material while the conversation talks about it.
		for (const light of this.lights) {
			const beat = Math.sin(time * 1.7 - light.beat) * 0.5 + 0.5;
			const level = light.rest * (0.75 + beat * 0.25) * (1 + busy * 0.5 + this.excited);
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
			// Never further round than the housing was made for: the iris stays inside the bezel.
			if (Math.acos(clamp(dir.z, -1, 1)) > EYE_TURN) {
				const across = Math.hypot(dir.x, dir.y) || 1;
				dir.set((dir.x / across) * Math.sin(EYE_TURN), (dir.y / across) * Math.sin(EYE_TURN), Math.cos(EYE_TURN));
			}
			turn.setFromUnitVectors(FORWARD, dir);
			// A glance is quick, as an eye's is.
			eye.look.quaternion.slerp(turn, 1 - Math.exp(-dt * 14));
		}
	}
}
