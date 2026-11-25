import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox } from '../kit/geometry';
import { color, mats } from '../kit/materials';
import { font, Surface } from '../kit/print';
import { hash, lerp, outBack, seg, smooth } from '../kit/math';
import { palette } from './palette';

/*
 * The reply's way home. Inside the data center the detokenizer has already turned the model's token IDs back into text,
 * and sent it up its glass tube: the IDs never leave. Out here the same pieces of text come out of the brainstem's seat
 * and fall down the reply's glass column in the tower's shaft, one after another, the way the model wrote them. At the
 * shaft's foot they lie down on the reply's lane and ride it out of the tower and along the hall to the press by the
 * door, which seals each one into a little pearl capsule of its own: encrypted again for the trip home, as the request
 * was on its way out. Then the string of them rides down the aqueduct's right lane, a stream, not one big parcel, and
 * each one opens in turn behind the harness's roof and drops its text through the hatch.
 *
 * Every piece follows the same lane at its own pace: it sets off a little after the one before, and gets home a little
 * after it, so they never catch up with each other.
 */

/** When the pieces set off and get home. The first is home at `arrive`, the rest one `every` apart. */
export const HOME = { from: 19.0, gap: 0.003, arrive: 19.1, every: 0.024, open: 0.007, fly: 0.05 };
const departs = (i: number) => HOME.from + i * HOME.gap;
const arrives = (i: number) => HOME.arrive + i * HOME.every;

/** A slip of the reply's text: the size it had in the tube. */
const SLIP_W = 0.72;
const SLIP_H = 0.3;
/** A sealed piece: a little pearl capsule, its glass's radius and the length of its straight part. */
const BEAD_R = 0.24;
const BEAD_L = 0.6;
/** How far its brass bands stand out from its glass: its foot is theirs. */
const BAND = 0.045;

/**
 * A monotone curve through (u, s) knots: how far along the lane a piece is, at each moment of its own trip. It sets off
 * from rest, and comes in at `dock` of its last stretch's pace rather than creeping to a stop, so the one behind it
 * never closes up on it. Fritsch and Carlson's tangents, so it never runs backwards between knots.
 */
function profile(knots: [number, number][], dock: number) {
	const n = knots.length;
	const d = knots.slice(1).map(([u, s], i) => (s - knots[i][1]) / (u - knots[i][0]));
	const m = knots.map((_, i) => (i === 0 ? 0 : i === n - 1 ? d[n - 2] * dock : d[i - 1] * d[i] <= 0 ? 0 : (2 * d[i - 1] * d[i]) / (d[i - 1] + d[i])));
	return (u: number) => {
		if (u <= 0) return knots[0][1];
		if (u >= 1) return knots[n - 1][1];
		let i = 0;
		while (i < n - 2 && u > knots[i + 1][0]) i++;
		const [u0, s0] = knots[i];
		const [u1, s1] = knots[i + 1];
		const h = u1 - u0;
		const t = (u - u0) / h;
		const t2 = t * t;
		const t3 = t2 * t;
		return (2 * t3 - 3 * t2 + 1) * s0 + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * s1 + (t3 - t2) * h * m[i + 1];
	};
}

/** A soft round glow, white at its heart: what makes the stream read from far off, as a string of lights. */
function glowTexture() {
	const s = new Surface(64, 64);
	s.draw((c, w, h) => {
		const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
		g.addColorStop(0, 'rgba(255,255,255,1)');
		g.addColorStop(0.25, 'rgba(214,232,255,0.75)');
		g.addColorStop(0.6, 'rgba(150,196,255,0.22)');
		g.addColorStop(1, 'rgba(150,196,255,0)');
		c.fillStyle = g;
		c.fillRect(0, 0, w, h);
	});
	return s.texture;
}

/** Little blue blocks, close together: the ciphertext the sealed glass is clouded with. */
function cipherTexture() {
	const s = new Surface(128, 64);
	s.draw((c, w, h) => {
		c.fillStyle = '#c9dbff';
		c.fillRect(0, 0, w, h);
		for (let i = 0; i < 70; i++) {
			c.fillStyle = hash(i * 3.1) > 0.5 ? '#2f74f0' : '#5d93f5';
			c.fillRect(hash(i) * w, hash(i + 0.5) * h, 5 + hash(i * 7.7) * 9, 4 + hash(i * 1.9) * 3);
		}
	});
	return s.texture;
}

export interface HomeRoute {
	/** The reply's lane, from the brainstem's seat down to behind the harness's roof. */
	lane: THREE.Curve<THREE.Vector3>;
	/** How far along it: the foot of the shaft, where the lane lies down; the press; and where the pieces open. */
	shaftFoot: number;
	seal: number;
	home: number;
	/** How high a thing's foot rides over the lane's line: on its belt. */
	belt: number;
	/** Where the column the text falls down begins, under the brainstem's seat. */
	top: number;
	/** The harness's roof hatch, where the text goes in. */
	hatch: THREE.Vector3;
	/** How high the text arcs on its way from a piece to the hatch. */
	arc: number;
}

export class HomeStream {
	group = new THREE.Group();
	private slips: THREE.Mesh[] = [];
	/** Each piece's glow, which goes with it from the seat to the hatch. */
	private glows: THREE.Sprite[] = [];
	private glass: THREE.InstancedMesh;
	private brass: THREE.InstancedMesh;
	private locks: THREE.InstancedMesh;
	private along: (u: number) => number;
	private len: number;
	private d = new THREE.Object3D();
	private p = new THREE.Vector3();
	private t = new THREE.Vector3();
	private q = new THREE.Vector3();
	private x = new THREE.Vector3();
	private y = new THREE.Vector3();
	private z = new THREE.Vector3();
	private m = new THREE.Matrix4();
	/** When each piece passes through the press, by the story's clock: for the press's stroke. */
	private sealedAt: number[];
	/** When the last piece leaves the shaft's foot: until then the column is lit. */
	private pouredAt: number;

	constructor(
		private route: HomeRoute,
		words: string[]
	) {
		this.group.name = 'reply-stream';
		this.len = route.lane.getLength();
		const { top, shaftFoot, seal, home } = route;
		// Down the shaft quickly, falling; along the hall to the press at a steady clip; then down the aqueduct, slowing
		// as it comes home.
		this.along = profile(
			[
				[0, top],
				[0.17, shaftFoot],
				[0.42, seal + 0.6],
				[1, home]
			],
			0.4
		);
		const m = mats();
		words.forEach((text) => {
			const s = new Surface(420, 170);
			s.draw((c, w, h) => {
				c.fillStyle = color.paper;
				c.fillRect(0, 0, w, h);
				c.fillStyle = color.ink;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.font = `600 62px ${font.mono}`;
				c.fillText(text.trim(), w / 2, h / 2);
			});
			const slip = new THREE.Mesh(new THREE.PlaneGeometry(SLIP_W, SLIP_H), new THREE.MeshStandardMaterial({ map: s.texture, emissiveMap: s.texture, emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.7, side: THREE.DoubleSide }));
			slip.castShadow = true;
			slip.visible = false;
			this.group.add(slip);
			this.slips.push(slip);
		});
		const glow = new THREE.SpriteMaterial({ map: glowTexture(), color: '#dcebff', transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending });
		words.forEach(() => {
			const g = new THREE.Sprite(glow);
			g.visible = false;
			g.renderOrder = 6;
			this.group.add(g);
			this.glows.push(g);
		});
		const n = words.length;
		const c = palette();
		const glass = new THREE.CapsuleGeometry(BEAD_R, BEAD_L, 6, 20).rotateZ(Math.PI / 2);
		this.glass = new THREE.InstancedMesh(
			glass,
			new THREE.MeshPhysicalMaterial({ map: cipherTexture(), color: '#eef4ff', roughness: 0.22, clearcoat: 1, emissive: '#2f6dff', emissiveIntensity: 0.18 }),
			n
		);
		const bands = mergeGeometries(
			[-BEAD_L / 2, 0, BEAD_L / 2].map((bx) => new THREE.TorusGeometry(BEAD_R + BAND - 0.03, 0.03, 8, 28).rotateY(Math.PI / 2).translate(bx, 0, 0))
		)!;
		this.brass = new THREE.InstancedMesh(bands, c.brass, n);
		// The padlock on its side, cobalt, as on the request's capsule.
		this.locks = new THREE.InstancedMesh(rbox(0.13, 0.11, 0.06, 0.025, 2).translate(0.14, -0.03, -BEAD_R - 0.025), m.cobalt, n);
		for (const im of [this.glass, this.brass, this.locks]) {
			im.frustumCulled = false;
			im.castShadow = true;
			for (let i = 0; i < n; i++) im.setMatrixAt(i, this.m.makeScale(0, 0, 0));
			this.group.add(im);
		}
		// When each passes a point along the lane: found by walking its own clock.
		const passes = (i: number, at: number) => {
			let lo = 0;
			let hi = 1;
			for (let k = 0; k < 30; k++) {
				const mid = (lo + hi) / 2;
				if (this.along(mid) < at) lo = mid;
				else hi = mid;
			}
			return lerp(departs(i), arrives(i), lo);
		};
		this.sealedAt = words.map((_, i) => passes(i, seal));
		this.pouredAt = passes(words.length - 1, shaftFoot);
	}

	/** How far along the lane the piece is now, or -1 while it hasn't set off or has already gone in. */
	private sAt(i: number, T: number) {
		const a = departs(i);
		const b = arrives(i);
		if (T < a || T > b) return -1;
		return this.along((T - a) / (b - a));
	}

	/** Where the first piece is: what the camera follows home. */
	head(T: number, out: THREE.Vector3) {
		const s = Math.max(0, this.sAt(0, Math.min(T, arrives(0))));
		return this.route.lane.getPointAt(Math.min(1, s / this.len), out).setY(out.y + this.route.belt);
	}

	/** When each piece goes through the press, and when its text drops in at the hatch: for their sounds. */
	get times() {
		return { sealed: this.sealedAt.slice(), landed: this.slips.map((_, i) => arrives(i) + HOME.open * 0.3 + HOME.fly) };
	}

	/** How many pieces the press has sealed by now, counting smoothly through each as it goes through. */
	sealed(T: number) {
		let n = 0;
		for (const at of this.sealedAt) n += smooth(seg(T, at - 0.003, at + 0.003));
		return n;
	}

	/** Where each capsule on the lane is now: the masts' readers read them as they pass. */
	cargo(out: THREE.Vector3[]) {
		out.length = 0;
		if (!this.group.visible) return out;
		for (let i = 0; i < this.slips.length; i++) {
			this.glass.getMatrixAt(i, this.m);
			const k = this.m.elements[0] ** 2 + this.m.elements[1] ** 2 + this.m.elements[2] ** 2;
			if (k > 0.01) out.push(this.spots[i].setFromMatrixPosition(this.m));
		}
		return out;
	}
	private spots = Array.from({ length: 8 }, () => new THREE.Vector3());

	/** 0 to 1: how lit the reply's column is, while the text pours down it. */
	pouring(T: number) {
		return smooth(seg(T, HOME.from - 0.001, HOME.from + 0.002)) * (1 - smooth(seg(T, this.pouredAt, this.pouredAt + 0.006)));
	}

	/** Whether any piece is on its way. */
	busy(T: number) {
		return T >= HOME.from && T <= arrives(this.slips.length - 1) + HOME.open + HOME.fly;
	}

	update(T: number, time: number) {
		const { lane, top, shaftFoot, seal, belt, hatch, arc } = this.route;
		const show = this.busy(T);
		this.group.visible = show;
		if (!show) return;
		const d = this.d;
		this.slips.forEach((slip, i) => {
			const s = this.sAt(i, T);
			const home = arrives(i);
			let bead = 0;
			slip.visible = false;
			if (s >= 0) {
				lane.getPointAt(Math.min(1, s / this.len), this.p);
				lane.getTangentAt(Math.min(1, s / this.len), this.t);
				if (s < seal) {
					// Text: falling down the column face on, fluttering; lying down as the lane does at the shaft's foot.
					const flat = smooth(seg(s, shaftFoot - 1.2, shaftFoot + 0.4));
					slip.visible = true;
					slip.position.copy(this.p);
					slip.position.y += lerp(0, belt + 0.012, flat);
					// Lying on the belt it has room to be read: as wide as the lane's bed between its kerbs.
					slip.scale.setScalar((1 + flat * 0.18) * smooth(seg(s, top, top + 0.5)));
					const flutter = (1 - flat) * Math.sin(time * 6 + i * 1.7);
					slip.rotation.set(lerp(0, -Math.PI / 2, flat) + flutter * 0.25, flutter * 0.3, (1 - flat) * Math.sin(time * 4 + i) * 0.12);
				} else bead = 1;
			}
			// Home: the capsule opens and is gone, and its text flies up over the roof and in at the hatch.
			const opened = seg(T, home, home + HOME.open);
			const flight = seg(T, home + HOME.open * 0.3, home + HOME.open * 0.3 + HOME.fly);
			if (s < 0 && T > home && opened < 1) bead = 1;
			if (T > home && flight > 0 && flight < 1) {
				lane.getPointAt(Math.min(1, this.route.home / this.len), this.p);
				// Out of the top of its capsule, clear of its bands.
				this.p.y += belt + BEAD_R * 2 + BAND + 0.25;
				const k = smooth(flight);
				this.q.set((this.p.x + hatch.x) / 2, Math.max(this.p.y, hatch.y) + arc, (this.p.z + hatch.z) / 2);
				const u = 1 - k;
				slip.visible = true;
				slip.position.set(
					u * u * this.p.x + 2 * u * k * this.q.x + k * k * hatch.x,
					u * u * this.p.y + 2 * u * k * this.q.y + k * k * hatch.y,
					u * u * this.p.z + 2 * u * k * this.q.z + k * k * hatch.z
				);
				const pop = outBack(seg(flight, 0, 0.25), 1.8);
				slip.scale.setScalar(Math.max(0.001, pop * (1 - smooth(seg(flight, 0.85, 1)) * 0.6)));
				slip.rotation.set(Math.sin(k * 7 + i) * 0.5 - 0.4, Math.sin(k * 5 + i * 2) * 0.6, Math.sin(k * 4 + i) * 0.2);
			} else if (s < 0) slip.scale.setScalar(1);

			// The capsule: on the lane past the press, sitting on its belt along it; at home it pops open and shrinks away.
			let scale = 0;
			if (bead > 0) {
				const at = s >= 0 ? s : this.route.home;
				lane.getPointAt(Math.min(1, at / this.len), this.p);
				lane.getTangentAt(Math.min(1, at / this.len), this.x).normalize();
				this.y.set(0, 1, 0).addScaledVector(this.x, -this.x.y).normalize();
				this.z.crossVectors(this.x, this.y);
				this.p.addScaledVector(this.y, belt + BEAD_R + BAND + 0.01);
				// Out of the press it grows to its size; at home it swells a little as it opens, and is gone.
				const out = smooth(seg(s, seal, seal + 0.5));
				const gone = s >= 0 ? 0 : seg(T, home, home + HOME.open);
				scale = (s >= 0 ? out : 1) * (1 + Math.sin(gone * Math.PI) * 0.25) * (1 - smooth(gone));
				d.position.copy(this.p);
				d.quaternion.setFromRotationMatrix(this.m.makeBasis(this.x, this.y, this.z));
				// Rolling a little on its runners as it rides.
				d.rotateX(Math.sin(time * 3 + i) * 0.05);
			}
			d.scale.setScalar(Math.max(0, scale));
			d.updateMatrix();
			// The glow: round the slip while it's text, round the capsule once it's sealed, fading as it opens at home.
			const g = this.glows[i];
			g.visible = slip.visible || scale > 0.01;
			if (g.visible) {
				g.position.copy(slip.visible ? slip.position : d.position);
				const k = slip.visible ? slip.scale.x : scale;
				g.scale.setScalar(1.5 * k);
			}
			for (const im of [this.glass, this.brass, this.locks]) im.setMatrixAt(i, d.matrix);
		});
		for (const im of [this.glass, this.brass, this.locks]) im.instanceMatrix.needsUpdate = true;
	}
}
