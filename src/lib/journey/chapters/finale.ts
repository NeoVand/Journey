import * as THREE from 'three';
import { TRIP } from '../content';
import { rbox, ring } from '../kit/geometry';
import { createSign } from '../kit/parts';
import { curve } from '../kit/machines';
import { mats } from '../kit/materials';
import { lerp, outBack, seg, smooth } from '../kit/math';
import { isPhone } from '../kit/print';

/** The last section: the camera pulls back, and for the first time the whole world is in one frame. */
export const FINALE_T = 31.97;
const TUBE_ON = [32.16, 32.33];
const STORY = [32.34, 32.92];
const LAP_MS = 14000;
const MOST = 5;

type V3 = [number, number, number];
const v = (p: V3) => new THREE.Vector3(...p);
const line = (a: V3, b: V3) => new THREE.LineCurve3(v(a), v(b));

/** A stretch of a curve, in either direction. */
class Part extends THREE.Curve<THREE.Vector3> {
	constructor(
		private base: THREE.Curve<THREE.Vector3>,
		private from: number,
		private to: number
	) {
		super();
	}
	getPoint(t: number, target = new THREE.Vector3()) {
		return this.base.getPointAt(lerp(this.from, this.to, t), target);
	}
}

interface Leg {
	path: THREE.Curve<THREE.Vector3>;
	/** How long it takes, relative to the others. A long pipe isn't more important than a short one. */
	time: number;
	/** How far above the line the token sits. Zero when it rides inside a tube. */
	ride: number;
	/** Which of the nine stops this belongs to. */
	step: number;
	/** Inside a machine, where nobody can see it. */
	hidden?: boolean;
	/** Smaller than a token usually is, where there's less room. */
	size?: number;
	/** How soon it starts to shrink on the way into a machine: smaller is sooner. */
	shrink?: number;
}

/** The pipes and places the token really rides, from the rest of the world. */
export interface Route {
	cable: THREE.Curve<THREE.Vector3>;
	out: THREE.Curve<THREE.Vector3>;
	under: THREE.Curve<THREE.Vector3>;
	down: THREE.Curve<THREE.Vector3>;
	flow: THREE.Curve<THREE.Vector3>;
	flowLip: number;
	back: THREE.Curve<THREE.Vector3>;
	gatePath: THREE.Curve<THREE.Vector3>;
	dock: V3;
	trackEnd: V3;
	gatewayX: number;
	templateX: number;
	slotX: number;
	beltY: number;
	lineZ: number;
	/** The underside of the island the gateway stands on, which the line down passes through. */
	islandUnder: number;
	/** The right-hand side of the model's pedestal, where the reply leaves. */
	flank: V3;
}

export class Finale {
	group = new THREE.Group();
	/** Which stop the newest token has reached, and how many laps have finished. */
	step = 0;
	laps = 0;
	/** What the machines react to. */
	harnessPulse = 0;
	brainBusy = 0;
	onTrack: number[] = [];
	/** Whether anything is on its way round right now. */
	running = false;

	private legs: Leg[] = [];
	private total = 0;
	private tokens: THREE.Mesh[] = [];
	private halos: THREE.Sprite[] = [];
	private runs: number[] = [];
	private glass: THREE.Mesh;
	private tubeSegments = 300;
	private tubeRadial = 28;
	private tubeRings: { mesh: THREE.Mesh; at: number }[] = [];
	private signs: { group: THREE.Group; at: number }[] = [];
	private stepStarts: number[] = [];
	private mat = new THREE.Matrix4();
	private p = new THREE.Vector3();
	private t = new THREE.Vector3();
	private side = new THREE.Vector3();
	private up = new THREE.Vector3();

	constructor(r: Route) {
		const m = mats();
		const [fx, fy, fz] = r.flank;
		// The way home: from the model's pedestal, wide around the right of everything, and down into the harness.
		const home = curve([
			[fx, fy, fz],
			[fx + 2.4, fy + 0.05, fz],
			[fx + 9, fy + 1.4, fz - 0.4],
			[24, -24, -0.6],
			[28, -10, -2.2],
			[24, 5.4, -3.2],
			[13, 11.2, -2.6],
			[5, 11.6, -1.4],
			[1.9, 10.9, -0.85],
			[1.1, 9, -0.75]
		]);
		// Modelled from the harness end, because that's the end it grows from: out of the stub, and away to find the model.
		const grown = new Part(home, 1, 0);
		this.glass = new THREE.Mesh(
			new THREE.TubeGeometry(grown, this.tubeSegments, 0.5, this.tubeRadial),
			new THREE.MeshPhysicalMaterial({ color: '#7fb4ea', transparent: true, opacity: 0.42, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		this.glass.renderOrder = 4;
		this.group.add(this.glass);
		const hoop = ring(0.6, 0.52, 0.08);
		const Y = new THREE.Vector3(0, 1, 0);
		for (let i = 1; i < 12; i++) {
			const at = i / 12;
			const mesh = new THREE.Mesh(hoop, m.steel);
			home.getPointAt(at, mesh.position);
			mesh.quaternion.setFromUnitVectors(Y, home.getTangentAt(at));
			mesh.castShadow = true;
			this.group.add(mesh);
			this.tubeRings.push({ mesh, at: 1 - at });
		}
		const collar = new THREE.Mesh(ring(0.74, 0.52, 0.26), m.steel);
		collar.position.set(fx + 0.1, fy, fz);
		collar.rotation.z = Math.PI / 2;
		this.group.add(collar);
		this.tubeRings.push({ mesh: collar, at: 1 });

		const hidden = true;
		const { lineZ: z, beltY } = r;
		const end = (path: THREE.Curve<THREE.Vector3>, u: number) => path.getPointAt(u).toArray() as V3;
		const firstWhere = (path: THREE.Curve<THREE.Vector3>, test: (p: THREE.Vector3) => boolean) => {
			for (let i = 0; i <= 400; i++) if (test(path.getPointAt(i / 400, this.p))) return i / 400;
			return 1;
		};
		const outEnd = firstWhere(r.out, (p) => p.x > 7);
		const above = (p: V3, h: number): V3 => [p[0], p[1] + h, p[2]];
		const downStart = firstWhere(r.down, (p) => p.y < r.islandUnder - 0.5);
		this.legs = [
			// Up from the keys and down onto the cable, which is thin and short, so it travels small.
			{ path: curve([[-3.3, 0.85, 1], [-2.4, 1.3, 0.5], [-1.5, 0.62, -0.3], above(end(r.cable, 0.28), 0.22), above(end(r.cable, 0.34), 0.2)]), time: 1, ride: 0, step: 0, size: 0.5 },
			{ path: new Part(r.cable, 0.34, 1), time: 0.6, ride: 0.2, step: 0, size: 0.5, shrink: 2.5 },
			{ path: line([0, 2, -0.65], [1.8, 2, -0.65]), time: 1.1, ride: 0, step: 1, hidden },
			// Above the pipe, high enough to clear the foot of the easel, and off it before the pipe turns down into the floor.
			{ path: new Part(r.out, 0, outEnd), time: 1.5, ride: 0.3, step: 2 },
			{ path: line(end(r.out, outEnd), end(r.under, 0)), time: 0.06, ride: 0, step: 2, hidden },
			{ path: r.under, time: 1, ride: 0.2, step: 2 },
			{ path: line(end(r.under, 1), [9.7, -6, z]), time: 0.1, ride: 0, step: 2, hidden },
			{ path: line([9.7, -6, z], [14.3, -6, z]), time: 0.9, ride: 0, step: 2 },
			// Through the gateway, and out of the bottom of its island. The token only reappears once it's clear of it.
			{ path: line([14.3, -6, z], end(r.down, downStart)), time: 1, ride: 0, step: 3, hidden },
			{ path: new Part(r.down, downStart, 1), time: 1.6, ride: 0.2, step: 3 },
			{ path: line(end(r.down, 1), [r.slotX, beltY, z]), time: 0.4, ride: 0, step: 3, hidden },
			{ path: new Part(r.flow, 0, r.flowLip), time: 2.2, ride: 0.24, step: 3, size: 0.72 },
			{ path: line([fx - 4, fy + 8, fz], [fx - 1, fy, fz]), time: 1.9, ride: 0, step: 4, hidden },
			{ path: home, time: 2.5, ride: 0, step: 5 },
			{ path: line([1.1, 9, -0.75], [1.1, 4.1, -0.75]), time: 0.3, ride: 0, step: 5 },
			{ path: line([1.1, 3.6, -0.75], [0.4, 3.2, -1.76]), time: 0.25, ride: 0, step: 6, hidden },
			{ path: r.gatePath, time: 2, ride: 0.2, step: 6 },
			{ path: line(r.dock, [r.dock[0] + 1.6, r.dock[1], r.dock[2]]), time: 0.2, ride: 0, step: 6, hidden },
			{ path: line([r.dock[0] + 1.6, r.dock[1], r.dock[2]], r.trackEnd), time: 2.1, ride: 0, step: 6 },
			{ path: curve([r.trackEnd, [-40.4, -12.1, 0.7], [-38.2, -13, 0.7], [-36.3, -14.46, 0.7]]), time: 0.6, ride: 0, step: 7 },
			{ path: line([-36.3, -14.46, 0.7], [-34, -14.7, 1]), time: 0.1, ride: 0, step: 7, hidden },
			{ path: curve([[-34, -14.7, 1], [-30, -14.7, 2.4], [-24, -14.7, 3.7], [-14.4, -14.7, 3.6]]), time: 1, ride: 0, step: 7 },
			{ path: line([-14.4, -14.36, 3.6], [-10.6, -13, 2.2]), time: 0.1, ride: 0, step: 8, hidden },
			{ path: new Part(r.back, 0.86, 0), time: 2, ride: 0.22, step: 8 }
		];
		this.total = this.legs.reduce((sum, leg) => sum + leg.time, 0);
		let sum = 0;
		this.legs.forEach((leg) => {
			if (this.stepStarts[leg.step] === undefined) this.stepStarts[leg.step] = sum / this.total;
			sum += leg.time;
		});

		const geo = rbox(1.4, 0.44, 0.9, 0.1, 3);
		const amber = (m.amber as THREE.MeshPhysicalMaterial).clone();
		amber.emissive.set('#ff9600');
		amber.emissiveIntensity = 1.15;
		// From this far away a token is a few pixels, so each one carries a glow that stays the same size on screen.
		const glow = document.createElement('canvas');
		glow.width = glow.height = 128;
		const gc = glow.getContext('2d')!;
		const fall = gc.createRadialGradient(64, 64, 0, 64, 64, 64);
		fall.addColorStop(0, 'rgba(255,244,214,1)');
		fall.addColorStop(0.14, 'rgba(255,196,64,0.86)');
		fall.addColorStop(0.36, 'rgba(255,160,20,0.28)');
		fall.addColorStop(1, 'rgba(255,150,0,0)');
		gc.fillStyle = fall;
		gc.fillRect(0, 0, 128, 128);
		const glowMap = new THREE.CanvasTexture(glow);
		glowMap.colorSpace = THREE.SRGBColorSpace;
		for (let i = 0; i <= MOST; i++) {
			const token = new THREE.Mesh(geo, amber);
			token.castShadow = true;
			token.visible = false;
			this.group.add(token);
			this.tokens.push(token);
			const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowMap, transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false }));
			halo.scale.setScalar(isPhone ? 0.06 : 0.045);
			halo.renderOrder = 6;
			halo.visible = false;
			this.group.add(halo);
			this.halos.push(halo);
		}

		// The nine stops, named where they happen. They appear as the first token reaches each one.
		const size = isPhone ? 1.6 : 0.8;
		const where: V3[] = [
			[-5.2, 3.6, 0.6],
			[5.4, 5.4, -0.75],
			[9.4, -2.7, z],
			[20.6, -2.2, z],
			[11.4, -29.6, 1.2],
			[23.6, -11.8, -2.2],
			[-52, -7, 0.7],
			[-27, -5.7, 1],
			[-5.2, -7.2, -1]
		];
		TRIP.forEach((stop, i) => {
			// Already sized for phones above, so it opts out of the general phone enlargement.
			const group = createSign(`${i + 1}  ${stop.name}`, size, undefined, undefined, true);
			group.position.set(...where[i]);
			group.visible = false;
			this.group.add(group);
			this.signs.push({ group, at: this.stepStarts[i] });
		});
		this.group.visible = false;
	}

	/** Enter: another token sets off from the keyboard. */
	press(reduced: boolean) {
		if (reduced) this.laps++;
		else if (this.runs.length < MOST) this.runs.push(performance.now());
	}

	private place(token: THREE.Mesh, u: number) {
		let at = u * this.total;
		let i = 0;
		while (i < this.legs.length - 1 && at > this.legs[i].time) at -= this.legs[i++].time;
		const leg = this.legs[i];
		// Stop and go, a little: each leg eases, so it reads as arriving rather than sliding by.
		const raw = Math.min(1, at / leg.time);
		const k = lerp(raw, smooth(raw), 0.5);
		// Going into a machine or coming out of one, it draws itself small enough for the way in.
		const quick = leg.shrink ?? 7;
		const from = this.legs[i - 1]?.hidden ? Math.min(1, k * quick) : 1;
		const to = this.legs[i + 1]?.hidden ? Math.min(1, (1 - k) * quick) : 1;
		const fit = Math.max(0.12, Math.min(from, to)) * (leg.size ?? 1);
		token.visible = !leg.hidden;
		if (!token.visible) return leg;
		leg.path.getPointAt(k, this.p);
		leg.path.getTangentAt(k, this.t);
		this.side.crossVectors(this.t, THREE.Object3D.DEFAULT_UP);
		if (this.side.lengthSq() < 0.001) this.side.set(0, 0, 1);
		this.side.normalize();
		this.up.crossVectors(this.side, this.t);
		// It rides on top of the pipe whichever way the pipe is heading, even straight down.
		token.position.copy(this.p).addScaledVector(this.up, leg.ride);
		this.mat.makeBasis(this.t, this.up, this.side);
		token.quaternion.setFromRotationMatrix(this.mat);
		// It swells in at the keyboard and is gone at the end of the green line.
		token.scale.setScalar(Math.max(0.001, Math.min(fit, u * 60, (1 - u) * 60)));
		return leg;
	}

	update(T: number) {
		const on = T >= FINALE_T;
		this.group.visible = on;
		if (!on) return;
		const now = performance.now();

		const drawn = smooth(seg(T, TUBE_ON[0], TUBE_ON[1]));
		this.glass.visible = drawn > 0;
		this.glass.geometry.setDrawRange(0, Math.floor(drawn * this.tubeSegments) * this.tubeRadial * 6);
		this.tubeRings.forEach(({ mesh, at }) => {
			const k = seg(drawn, at - 0.02, at + 0.02);
			mesh.visible = k > 0;
			mesh.scale.setScalar(Math.max(0.001, outBack(k, 2)));
		});

		const story = seg(T, STORY[0], STORY[1]);
		this.signs.forEach(({ group, at }) => {
			const k = seg(story, at, at + 0.035);
			group.visible = k > 0;
			group.scale.setScalar(Math.max(0.001, outBack(k, 2)));
		});

		this.harnessPulse = 0;
		this.brainBusy = 0;
		this.onTrack.length = 0;
		this.running = (story > 0 && story < 1) || this.runs.length > 0;
		let newest = 0;
		const ride = (token: THREE.Mesh, u: number) => {
			const leg = this.place(token, u);
			if (leg.step === 1) this.harnessPulse = 1;
			if (leg.step === 4) this.brainBusy = 1;
			if (leg.step === 6) this.onTrack.push(token.position.x);
			newest = leg.step;
		};
		const told = this.tokens[0];
		if (story > 0 && story < 1) ride(told, story);
		else told.visible = false;

		// Runs finish oldest first, so anything over a lap is always at the front of the list.
		while (this.runs.length && now - this.runs[0] > LAP_MS) {
			this.runs.shift();
			this.laps++;
		}
		for (let i = 1; i < this.tokens.length; i++) {
			const start = this.runs[i - 1];
			if (start === undefined) this.tokens[i].visible = false;
			else ride(this.tokens[i], (now - start) / LAP_MS);
		}
		this.step = newest;
		this.tokens.forEach((token, i) => {
			const halo = this.halos[i];
			halo.visible = token.visible && token.scale.x > 0.2;
			if (halo.visible) halo.position.copy(token.position);
		});
	}
}
