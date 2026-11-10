import * as THREE from 'three';
import { TRIP } from '../content';
import { LOWER, MODEL_FLANK, MODEL_ISLAND_Y, MODEL_X } from '../layout';
import { rbox } from '../kit/geometry';
import { createSign } from '../kit/parts';
import { curve } from '../kit/machines';
import { mats } from '../kit/materials';
import { lerp, outBack, seg, smooth } from '../kit/math';
import { isPhone } from '../kit/print';

/** The last section: the camera pulls back, and for the first time the whole world is in one frame. */
export const FINALE_T = 31.97;
const STORY = [32.34, 32.92];
const LAP_MS = 14000;
const MOST = 5;

type V3 = [number, number, number];
const v = (p: V3) => new THREE.Vector3(...p);
const line = (a: V3, b: V3) => new THREE.LineCurve3(v(a), v(b));
/** Where something drawn for the gates or the workshop stands now, in the ring below your laptop. */
const low = (p: V3): V3 => [p[0] + LOWER[0], p[1] + LOWER[1], p[2] + LOWER[2]];

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
	/** From the edge of your island up to the foot of the wire. */
	up: THREE.Curve<THREE.Vector3>;
	down: THREE.Curve<THREE.Vector3>;
	flow: THREE.Curve<THREE.Vector3>;
	flowLip: number;
	back: THREE.Curve<THREE.Vector3>;
	gatePath: THREE.Curve<THREE.Vector3>;
	dock: V3;
	trackEnd: V3;
	slotX: number;
	beltY: number;
	lineZ: number;
	/** The glass of the wire: where it starts and ends along x, and its height. */
	tunnel: [number, number, number];
	/** The reply's glass tube, from the model down to the harness's roof. */
	stream: THREE.Curve<THREE.Vector3>;
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
	private signs: { group: THREE.Group; at: number }[] = [];
	private stepStarts: number[] = [];
	private mat = new THREE.Matrix4();
	private p = new THREE.Vector3();
	private t = new THREE.Vector3();
	private side = new THREE.Vector3();
	private up = new THREE.Vector3();

	constructor(r: Route) {
		const m = mats();
		const hidden = true;
		const { lineZ: z, beltY } = r;
		const end = (path: THREE.Curve<THREE.Vector3>, u: number) => path.getPointAt(u).toArray() as V3;
		const above = (p: V3, h: number): V3 => [p[0], p[1] + h, p[2]];
		const [tunnelFrom, tunnelTo, tunnelY] = r.tunnel;
		// Where the green loop comes out of the sandbox's wall, on its way back up to the harness.
		const wall = v(low([-10.6, -13, 2.2]));
		let backFrom = 0;
		for (let i = 0, best = Infinity; i <= 400; i++) {
			const d = r.back.getPointAt(i / 400, this.p).distanceTo(wall);
			if (d < best) [best, backFrom] = [d, i / 400];
		}
		const flowEnd = end(r.flow, 1);
		this.legs = [
			// Up from the keys and down onto the cable, which is thin and short, so it travels small.
			{ path: curve([[-3.3, 0.85, 1], [-2.4, 1.3, 0.5], [-1.5, 0.62, -0.3], above(end(r.cable, 0.28), 0.22), above(end(r.cable, 0.34), 0.2)]), time: 1, ride: 0, step: 0, size: 0.5 },
			{ path: new Part(r.cable, 0.34, 1), time: 0.6, ride: 0.2, step: 0, size: 0.5, shrink: 2.5 },
			{ path: line([0, 2, -0.65], [1.8, 2, -0.65]), time: 1.1, ride: 0, step: 1, hidden },
			// Along the pipe past the easel, riding high enough to clear the easel's foot, and up the pipe into the sky.
			{ path: r.out, time: 1.5, ride: 0.3, step: 2 },
			{ path: r.up, time: 1.2, ride: 0.2, step: 2 },
			{ path: line(end(r.up, 1), [tunnelFrom + 0.1, tunnelY, z]), time: 0.1, ride: 0, step: 2, hidden },
			{ path: line([tunnelFrom + 0.1, tunnelY, z], [tunnelTo - 0.1, tunnelY, z]), time: 0.9, ride: 0, step: 2 },
			// Through the gateway, and out of its back wall up to the tokenizer.
			{ path: line([tunnelTo - 0.1, tunnelY, z], end(r.down, 0.03)), time: 1, ride: 0, step: 3, hidden },
			{ path: new Part(r.down, 0.03, 1), time: 1.6, ride: 0.2, step: 3 },
			{ path: line(end(r.down, 1), [r.slotX, beltY, z]), time: 0.4, ride: 0, step: 3, hidden },
			{ path: new Part(r.flow, 0, r.flowLip), time: 2.4, ride: 0.24, step: 3, size: 0.72 },
			// Through the model, and out of the side of its pedestal into the glass.
			{ path: line(flowEnd, end(r.stream, 0)), time: 1.9, ride: 0, step: 4, hidden },
			{ path: r.stream, time: 2.5, ride: 0, step: 5 },
			{ path: line([1.1, 3.6, -0.75], [0.4, 3.2, -1.76]), time: 0.25, ride: 0, step: 6, hidden },
			{ path: r.gatePath, time: 2, ride: 0.2, step: 6 },
			{ path: line(r.dock, [r.dock[0] + 1.6, r.dock[1], r.dock[2]]), time: 0.2, ride: 0, step: 6, hidden },
			{ path: line([r.dock[0] + 1.6, r.dock[1], r.dock[2]], r.trackEnd), time: 2.1, ride: 0, step: 6 },
			{ path: curve([r.trackEnd, low([-40.4, -12.1, 0.7]), low([-38.2, -13, 0.7]), low([-36.3, -14.46, 0.7])]), time: 0.6, ride: 0, step: 7 },
			{ path: line(low([-36.3, -14.46, 0.7]), low([-34, -14.7, 1])), time: 0.1, ride: 0, step: 7, hidden },
			{ path: curve([low([-34, -14.7, 1]), low([-30, -14.7, 2.4]), low([-24, -14.7, 3.7]), low([-14.4, -14.7, 3.6])]), time: 1, ride: 0, step: 7 },
			{ path: line(low([-14.4, -14.36, 3.6]), end(r.back, backFrom)), time: 0.1, ride: 0, step: 8, hidden },
			{ path: new Part(r.back, backFrom, 0), time: 2, ride: 0.22, step: 8 }
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
			[tunnelFrom - 0.2, tunnelY + 3.3, z],
			[tunnelTo + 6.2, tunnelY + 1.2, z],
			[MODEL_X - 9.4, MODEL_ISLAND_Y + 9.6, 1.2],
			[MODEL_FLANK[0] - 18.4, 15.6, -0.5],
			low([-52, -7, 0.7]),
			low([-27, -5.7, 1]),
			[23.4, -7.4, -1]
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
