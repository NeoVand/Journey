import * as THREE from 'three';
import { rbox } from '../../kit/geometry';
import { color, Lamp, mats } from '../../kit/materials';
import { clamp, inCubic, inOut, lerp, outCubic } from '../../kit/math';
import { font, roundRectPath, Surface } from '../../kit/print';
import { Cart } from './acts';
import type { Gate, Screen } from './checks';
import { BENCH, BENCHES, CAPSULE, CHUTE, LIP, PAD, RAIL_WEST_Z, SCREEN, SIDE_X, skillAt, SUB, TRAY, TRAY_Z, TUBE } from './layout';
import type { Capsule } from './loop';
import type { SubRoom } from './subagent';
import { TILE_COLOR, type TileKind } from './tiles';
import { trayAt } from './tray';
import {
	cartAt,
	CARDS,
	D,
	LIP_X0,
	NESTS,
	PITCH,
	PROMPT_LIP_X,
	RAIL_LEN,
	RAIL_PATH,
	REREAD,
	RIDES,
	screenAt,
	SLOT_X0,
	slotX,
	TILE,
	TILTS,
	TURNS,
	type CardRun,
	type Fall,
	type Result,
	type Ride
} from './turns';

/*
 * The room at work: everything that moves, posed from the trip's script (turns.ts) at trip time t. Nothing here keeps
 * state from one frame to the next, so the trip plays the same whichever way the reader goes, and from wherever.
 *
 * The capsule takes a copy up; the reply's tiles come down the chute and along the lip; each call is printed on a card
 * that boards the cart in the gate; the gate checks it (your hook, your rules, and you); the cart posts it into a
 * bench, which sends it out along its wire to the real thing and back; and the cart tips the results into the tray.
 */

export type Parts = {
	group: THREE.Group;
	capsule: Capsule;
	feeder: THREE.Curve<THREE.Vector3>;
	chuteSlide: THREE.Curve<THREE.Vector3>;
	gate: Gate;
	screen: Screen;
	hookCable: THREE.Curve<THREE.Vector3>;
	cart: Cart;
	benchLamps: Lamp[];
	wires: THREE.Curve<THREE.Vector3>[];
	subagent: SubRoom;
	skillCards: THREE.Object3D[];
};

/* ---------- where travellers go ---------- */

const UP = new THREE.Vector3(0, 1, 0);
/** A tile's middle, riding the lip, and sitting in the tray. */
const LIP_Z = (LIP.z0 + LIP.z1) / 2;
const LIP_Y = LIP.y + 0.03 + TILE.h / 2;
const TRAY_Y = TRAY.base + TILE.h / 2;
/** How high a tile swings on its way from the lip or the cart into its slot: clear of the rims and its neighbours. */
const SWING_Y = 0.95;
/** Where the reply's tiles come from: out of the sky, down the chute's shaft, onto its foot. */
const CHUTE_X = (CHUTE.x0 + CHUTE.x1) / 2;
const CHUTE_Z = (CHUTE.z0 + CHUTE.z1) / 2;
const SKY = 10;
const FOOT_Y = CHUTE.foot + TILE.h / 2;
/** Where a call's card pops up on the pad, beside the way the tiles go, behind the gate. */
const PRINT = new THREE.Vector3(-4.85, PAD.y, PAD.z0 + 0.15);
const CARD = { w: 0.3, h: 0.4, d: 0.04 };
/** Your prompt's way: out of your screen, over your hooks' cable, round the front of the gate, and onto the lip. */
const PROMPT_WAY = new THREE.CatmullRomCurve3([
	new THREE.Vector3(-SIDE_X + 0.05, 1.75, SCREEN.z1 - 0.45),
	new THREE.Vector3(-6.3, 1.55, -0.45),
	new THREE.Vector3(-5.2, 1.25, -0.4),
	new THREE.Vector3(PROMPT_LIP_X, 0.95, -0.95),
	new THREE.Vector3(PROMPT_LIP_X, 0.62, -2.25),
	new THREE.Vector3(PROMPT_LIP_X, LIP_Y, LIP_Z)
]);

/** The cart's rail point and heading at s along it. */
const railPoint = (s: number, out: THREE.Vector3) => RAIL_PATH.getPointAt(clamp(s / RAIL_LEN), out);
const railYaw = (s: number) => {
	const t = RAIL_PATH.getTangentAt(clamp(s / RAIL_LEN), tmpTan);
	return Math.atan2(-t.z, t.x);
};
const tmpTan = new THREE.Vector3();

/** A quadratic Bézier through three points, into `out`. */
function bezier(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, k: number, out: THREE.Vector3) {
	const u = 1 - k;
	return out.set(u * u * a.x + 2 * u * k * b.x + k * k * c.x, u * u * a.y + 2 * u * k * b.y + k * k * c.y, u * u * a.z + 2 * u * k * b.z + k * k * c.z);
}
/** An arc from a to b, up by `height` in the middle. */
function hop(a: THREE.Vector3, b: THREE.Vector3, k: number, height: number, out: THREE.Vector3) {
	out.lerpVectors(a, b, k);
	out.y += Math.sin(Math.PI * k) * height;
	return out;
}

/** A call's card: amber, the tool's name and what it asks, printed on its face. */
class CallCard {
	group = new THREE.Group();
	body: THREE.Mesh;
	face: THREE.Mesh;
	private bodyMat: THREE.MeshPhysicalMaterial;
	private faceMat: THREE.MeshStandardMaterial;
	private shown = '';
	private static faces = new Map<string, THREE.Texture>();

	constructor() {
		this.bodyMat = (mats().amber as THREE.MeshPhysicalMaterial).clone();
		this.body = new THREE.Mesh(rbox(CARD.w, CARD.h, CARD.d, 0.025, 3), this.bodyMat);
		this.body.castShadow = true;
		this.faceMat = new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true });
		this.face = new THREE.Mesh(new THREE.PlaneGeometry(CARD.w - 0.04, CARD.h - 0.06), this.faceMat);
		this.face.position.z = CARD.d / 2 + 0.002;
		this.group.add(this.body, this.face);
		this.group.visible = false;
	}

	/** Prints the call on its face, once per call. */
	print(tool: string, arg: string) {
		const key = tool + '|' + arg;
		if (key === this.shown) return;
		this.shown = key;
		let tex = CallCard.faces.get(key);
		if (!tex) {
			const s = new Surface(260, 340);
			s.draw((c, w, h) => {
				c.fillStyle = 'rgba(255,255,255,0.55)';
				roundRectPath(c, 6, 6, w - 12, h * 0.36, 16);
				c.fill();
				c.fillStyle = color.ink;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.font = `800 ${tool.length > 6 ? 46 : 58}px ${font.sans}`;
				c.fillText(tool, w / 2, h * 0.2);
				c.font = `600 ${arg.length > 12 ? 24 : 30}px ${font.mono}`;
				const words = arg.length > 14 ? [arg.slice(0, Math.ceil(arg.length / 2)), arg.slice(Math.ceil(arg.length / 2))] : [arg];
				words.forEach((line, i) => c.fillText(line, w / 2, h * (0.55 + i * 0.13)));
			});
			tex = s.texture;
			CallCard.faces.set(key, tex);
		}
		this.faceMat.map = tex;
		this.faceMat.needsUpdate = true;
	}

	/** Amber, turning red as it's refused; and how much it has become a tile (for the refusal). */
	tint(red: number, morph = 0) {
		this.bodyMat.color.set(color.amber).lerp(redColor, red);
		this.faceMat.opacity = 1 - clamp(morph * 2.5);
		const sx = lerp(1, TILE.d / CARD.w, morph);
		const sy = lerp(1, TILE.h / CARD.h, morph);
		const sz = lerp(1, TILE.w / CARD.d, morph);
		this.group.scale.set(sx, sy, sz);
	}
}
const redColor = new THREE.Color(TILE_COLOR.refusal);

/** The skill's copy: the shelf's card, coming down to the cart to be unfolded. */
function skillCopy() {
	const m = mats();
	const g = new THREE.Group();
	const card = new THREE.Mesh(rbox(0.38, 0.52, 0.06, 0.02, 2), m.cream);
	card.castShadow = true;
	g.add(card);
	const s = new Surface(340, 120);
	s.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.font = `700 ${h * 0.5}px ${font.sans}`;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText('debugging', w / 2, h * 0.55);
	});
	const label = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.1), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.6, transparent: true }));
	label.position.set(0, 0.1, 0.032);
	g.add(label);
	g.visible = false;
	return g;
}

/** A pulse: a bead that runs along a cable, in the cable's colour, a little lighter. */
function bead(hex: string, r: number) {
	const c = new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), 0.35);
	const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 12), new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.25, clearcoat: 1, emissive: c, emissiveIntensity: 0.25 }));
	mesh.visible = false;
	return mesh;
}

type Load = { r: Result; card: CardRun | null; deck: number; bench: number; inBench: number; source: 'bench' | 'skill' | 'sub' };

export class Play {
	private flying: THREE.InstancedMesh;
	private n = 0;
	private cards = [new CallCard(), new CallCard(), new CallCard()];
	private copy = skillCopy();
	private hookBead: THREE.Mesh;
	private benchBeads: THREE.Mesh[];
	private loads: Load[] = [];
	private m4 = new THREE.Matrix4();
	private q = new THREE.Quaternion();
	private q2 = new THREE.Quaternion();
	private v = new THREE.Vector3();
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private c = new THREE.Vector3();
	private s = new THREE.Vector3(1, 1, 1);
	private col = new THREE.Color();
	private euler = new THREE.Euler();

	constructor(private parts: Parts) {
		this.flying = new THREE.InstancedMesh(
			rbox(TILE.w, TILE.h, TILE.d, 0.035, 3),
			new THREE.MeshPhysicalMaterial({ color: '#ffffff', roughness: 0.34, clearcoat: 0.8, clearcoatRoughness: 0.2 }),
			48
		);
		this.flying.castShadow = true;
		this.flying.frustumCulled = false;
		this.flying.count = 0;
		parts.group.add(this.flying);
		for (const card of this.cards) parts.group.add(card.group);
		parts.group.add(this.copy);
		this.hookBead = bead(color.cobalt, 0.075);
		this.benchBeads = BENCHES.map((b) => bead(b.wire, 0.068));
		parts.group.add(this.hookBead, ...this.benchBeads);
		parts.cart.card.visible = false;

		// Every result the cart will carry: where it comes from, and its place on the deck, by the order it boards.
		for (const turn of TURNS) {
			const rs = turn.cards.flatMap((k) => k.results.map((r) => ({ r, card: k })));
			const order = [...rs].sort((x, y) => x.r.aboard - y.r.aboard);
			const perBench = new Map<number, number>();
			for (const { r, card } of rs) {
				const where = card.call.where;
				const bench = typeof where === 'number' ? where : -1;
				const inBench = perBench.get(bench) ?? 0;
				perBench.set(bench, inBench + 1);
				// The subagent's report rides alone, in the middle of the deck.
				const deck = where === 'sub' ? 1 : order.findIndex((x) => x.r === r);
				this.loads.push({ r, card, deck, bench, inBench, source: where === 'skill' ? 'skill' : where === 'sub' ? 'sub' : 'bench' });
			}
		}
		REREAD.forEach((r, i) => this.loads.push({ r, card: null, deck: i, bench: 0, inBench: i, source: 'bench' }));
	}

	update(t: number, time: number) {
		this.n = 0;
		const s = cartAt(t);
		this.poseCart(s, t);
		this.poseCapsule(t);
		for (const turn of TURNS) for (const f of turn.falls) if (t >= f.fall && t < f.born) this.poseFall(f, t);
		for (const r of RIDES) if (t >= r.from && t < r.born) this.poseRide(r, t);
		this.poseCards(t);
		for (const load of this.loads) this.poseLoad(load, t);
		this.poseGate(t, time);
		this.poseBenches(t);
		this.poseSkill(t);
		this.parts.subagent.pose(t, NESTS);
		const screen = screenAt(t);
		this.parts.screen.show(screen.lines, screen.ask, screen.answered);
		this.flying.count = this.n;
		this.flying.instanceMatrix.needsUpdate = true;
		if (this.flying.instanceColor) this.flying.instanceColor.needsUpdate = true;
	}

	/* ---------- tiles in flight ---------- */

	/** One tile, at p, its long side along yaw (0 is along z), scaled by k, in a kind's colour. */
	private tile(p: THREE.Vector3, yaw: number, kind: TileKind | THREE.Color, scale = 1, q?: THREE.Quaternion, span = 1) {
		if (this.n >= this.flying.instanceMatrix.count) return;
		if (q) this.q.copy(q);
		else this.q.setFromAxisAngle(UP, yaw);
		this.s.set(scale * (1 + (span - 1) * (PITCH / TILE.w)), scale, scale);
		this.m4.compose(p, this.q, this.s);
		this.flying.setMatrixAt(this.n, this.m4);
		this.flying.setColorAt(this.n, typeof kind === 'string' ? this.col.set(TILE_COLOR[kind]) : kind);
		this.n++;
	}

	/** From riding the lip at x, up, round and down into its slot: k from 0 to 1. */
	private swing(k: number, fromX: number, slot: number, kind: TileKind, span = 1) {
		const up = clamp(k / 0.55);
		const x = SLOT_X0 + (slot + span / 2) * PITCH;
		this.v.set(lerp(fromX, x, inOut(up)), k < 0.55 ? lerp(LIP_Y, SWING_Y, outCubic(up)) : lerp(SWING_Y, TRAY_Y, inCubic((k - 0.55) / 0.45)), lerp(LIP_Z, TRAY_Z, inOut(up)));
		this.tile(this.v, (Math.PI / 2) * (1 - inOut(up)), kind, 1, undefined, span);
	}

	/** A tile of the reply: out of the sky into the chute, onto its foot, down the slide, off its end onto the lip. */
	private poseFall(f: Fall, t: number) {
		const p = f.pace;
		if (t < f.foot) {
			const k = (t - f.fall) / (f.foot - f.fall);
			this.v.set(CHUTE_X, lerp(SKY, FOOT_Y, k * k), CHUTE_Z);
			this.tile(this.v, 0, f.kind, Math.min(1, 0.3 + k * 5));
			return;
		}
		if (t < f.pad) {
			const k = (t - f.foot) / (f.pad - f.foot);
			const slide = this.parts.chuteSlide;
			if (k < 0.15) {
				slide.getPointAt(0, this.a);
				this.a.y += 0.03 + TILE.h / 2;
				this.b.set(CHUTE_X, FOOT_Y, CHUTE_Z);
				this.v.lerpVectors(this.b, this.a, inOut(k / 0.15));
				this.tile(this.v, 0, f.kind);
				return;
			}
			// Down the slide, quicker as it goes, slowing on the pad at the end.
			const u = inOut((k - 0.15) / 0.85);
			slide.getPointAt(u, this.v);
			slide.getTangentAt(u, tmpTan);
			this.a.copy(UP).addScaledVector(tmpTan, -UP.dot(tmpTan)).normalize();
			this.v.addScaledVector(this.a, 0.03 + TILE.h / 2);
			this.m4.lookAt(tmpTan, this.c.set(0, 0, 0), this.a);
			this.q2.setFromRotationMatrix(this.m4);
			this.tile(this.v, 0, f.kind, 1, this.q2);
			return;
		}
		if (t < f.lip) {
			this.stepOn((t - f.pad) / (f.lip - f.pad), f.kind);
			return;
		}
		this.alongLip(t, f.lip, f.born - D.swing * p, f.born, f.slot, f.kind);
	}

	/** Off the slide's end, which points along the lip, and over onto the lip. */
	private stepOn(k: number, kind: TileKind | THREE.Color) {
		this.parts.chuteSlide.getPointAt(1, this.a);
		this.a.y += 0.03 + TILE.h / 2;
		this.b.set(LIP_X0 - 0.15, LIP_Y, this.a.z + 0.01);
		this.c.set(LIP_X0, LIP_Y, LIP_Z);
		bezier(this.a, this.b, this.c, inOut(k), this.v);
		this.tile(this.v, Math.PI / 2, kind);
	}

	/** Along the lip to the slot's x, maybe waiting there, then the swing in. */
	private alongLip(t: number, lip: number, swing: number, born: number, slot: number, kind: TileKind, wait = swing, from = LIP_X0) {
		const x = slotX(slot);
		if (t < swing) {
			const k = clamp((t - lip) / (wait - lip));
			this.v.set(lerp(from, x, k), LIP_Y, LIP_Z);
			this.tile(this.v, Math.PI / 2, kind);
			return;
		}
		this.swing((t - swing) / (born - swing), x, slot, kind);
	}

	/** Your prompt out of your screen, or the gate's "no" off the pad: onto the lip, along it, and in. */
	private poseRide(r: Ride, t: number) {
		if (t < r.lip) {
			const k = (t - r.from) / (r.lip - r.from);
			if (r.kind === 'prompt') {
				// Out of the glass end first, and round in front of the gate, like a sled.
				PROMPT_WAY.getPointAt(inOut(k), this.v);
				this.tile(this.v, Math.PI / 2, 'prompt', Math.min(1, k * 5));
			} else this.stepOn(k, 'refusal');
			return;
		}
		this.alongLip(t, r.lip, r.swing, r.born, r.slot, r.kind, r.wait, r.kind === 'prompt' ? PROMPT_LIP_X : LIP_X0);
	}

	/* ---------- the calls' cards ---------- */

	private poseCards(t: number) {
		for (const card of this.cards) card.group.visible = false;
		for (const k of CARDS) {
			const end = k.into !== undefined ? k.into + this.postTime(k) : k.out !== undefined ? k.out + D.deny * k.pace : k.printed;
			if (t < k.printed || t >= end) continue;
			const card = this.cards[k.j];
			card.group.visible = true;
			card.print(k.call.tool, k.call.arg);
			this.poseCard(card, k, t);
		}
	}

	private postTime(k: CardRun) {
		return (k.call.where === 'skill' ? D.shelf : k.call.where === 'sub' ? D.hop * 1.6 : D.slot) * k.pace;
	}

	/** Where a card stands on the deck: fanned across it, the one being checked lifted up under the bell. */
	private deckPlace(k: CardRun, t: number, out: THREE.Vector3) {
		const lift = k.check && t >= k.check && t < k.settled ? Math.sin(Math.PI * clamp((t - k.check) / (k.settled - k.check))) : 0;
		const x = (k.j - (k.n - 1) / 2) * 0.19;
		out.set(x, Cart.deck + CARD.h / 2 + lift * 0.16, -Math.abs(k.j - (k.n - 1) / 2) * 0.05 + lift * 0.08);
		return out.applyMatrix4(this.parts.cart.group.matrix);
	}

	private poseCard(card: CallCard, k: CardRun, t: number) {
		const p = k.pace;
		const g = card.group;
		g.rotation.set(0, 0, 0);
		card.tint(0);
		const rise = k.printed + D.print * p;
		const hopFrom = k.aboard - D.hop * p;
		// Up out of the pad, as the call goes by on its way to the tray.
		if (t < rise) {
			g.position.set(PRINT.x, PRINT.y + CARD.h / 2 - (1 - outCubic((t - k.printed) / (rise - k.printed))) * CARD.h, PRINT.z);
			return;
		}
		this.a.set(PRINT.x, PRINT.y + CARD.h / 2, PRINT.z);
		if (t < hopFrom) {
			g.position.copy(this.a);
			return;
		}
		// Over the lip and through the gate's back onto the cart.
		if (t < k.aboard) {
			this.deckPlace(k, k.aboard, this.b);
			hop(this.a, this.b, inOut((t - hopFrom) / (k.aboard - hopFrom)), 0.6, g.position);
			return;
		}
		// Refused: red, then thrown back out onto the pad, flipping over into the tile that says no.
		if (k.out !== undefined) {
			card.tint(clamp((t - k.verdict) / (D.verdict * p)));
			if (t < k.out) {
				this.deckPlace(k, t, g.position);
				return;
			}
			const f = clamp((t - k.out) / (D.deny * p));
			this.deckPlace(k, k.out, this.a);
			this.parts.chuteSlide.getPointAt(1, this.b);
			this.b.y += 0.03 + TILE.h / 2;
			hop(this.a, this.b, inOut(f), 0.7, g.position);
			g.rotation.set(-Math.PI * inOut(f), Math.PI / 2 * inOut(f), 0);
			card.tint(1, inOut(f));
			return;
		}
		if (k.into === undefined || t < k.into) {
			this.deckPlace(k, t, g.position);
			return;
		}
		const f = clamp((t - k.into) / this.postTime(k));
		this.deckPlace(k, k.into, this.a);
		if (typeof k.call.where === 'number') {
			// Posted into the bench's slot, turned to fit it, sinking in.
			const z = BENCHES[k.call.where].z;
			this.b.set(BENCH.x0 + 0.12, BENCH.h + CARD.h / 2 + 0.05, z);
			const over = clamp(f / 0.55);
			hop(this.a, this.b, inOut(over), 0.35, g.position);
			g.rotation.y = (Math.PI / 2) * inOut(over);
			if (f > 0.55) g.position.y = this.b.y - inCubic((f - 0.55) / 0.45) * (CARD.h + 0.08);
		} else if (k.call.where === 'skill') {
			// Up to the shelf, and in behind the skill it asks for.
			this.b.copy(skillAt(0));
			this.b.y += 0.3;
			this.b.z -= 0.1;
			hop(this.a, this.b, inOut(f), 0.8, g.position);
			g.scale.setScalar(lerp(1, 0.7, f));
		} else {
			// Through the subagent's door, turned to fit it and getting smaller as it goes into the smaller room.
			this.b.set(SUB.x1 - 0.45, 0.25, RAIL_WEST_Z);
			g.position.lerpVectors(this.a, this.b, inOut(f));
			g.position.y += Math.sin(Math.PI * f) * 0.15;
			g.rotation.y = (Math.PI / 2) * inOut(clamp(f * 2));
			g.scale.setScalar(lerp(1, 0.3, inOut(f)));
		}
	}

	/* ---------- results: out of the benches, onto the cart, into the tray ---------- */

	/** A result's place on the deck: three across, piled up in the order they board. */
	private deckSpot(deck: number, out: THREE.Vector3) {
		out.set(0, Cart.deck + TILE.h / 2 + 0.005 + Math.floor(deck / 3) * (TILE.h + 0.01), ((deck % 3) - 1) * 0.155);
		return out.applyMatrix4(this.parts.cart.group.matrix);
	}

	private poseLoad(l: Load, t: number) {
		const { r } = l;
		const p = r.pace;
		if (t >= r.born) return;
		const cartYaw = this.parts.cart.group.rotation.y;
		const onDeck = (spot: THREE.Vector3) => {
			this.deckSpot(l.deck, spot);
			this.q2.copy(this.parts.cart.group.quaternion);
			this.q.setFromAxisAngle(UP, Math.PI / 2);
			this.q2.multiply(this.q);
			return this.q2;
		};
		if (t >= r.tip) {
			// Tipped in: up off the deck, over the lip and the rim, turning to lie along the tray, and down.
			const k = (t - r.tip) / (r.born - r.tip);
			onDeck(this.a);
			this.b.set(SLOT_X0 + (r.slot + r.span / 2) * PITCH, TRAY_Y, TRAY_Z);
			hop(this.a, this.b, inOut(k), 0.75, this.v);
			this.tile(this.v, lerp(cartYaw + Math.PI / 2, Math.round((cartYaw + Math.PI / 2) / Math.PI) * Math.PI, inOut(k)), 'result', 1, undefined, r.span);
			return;
		}
		if (t >= r.aboard) {
			const q = onDeck(this.v);
			this.tile(this.v, 0, 'result', 1, q, r.span);
			return;
		}
		if (l.source === 'skill') {
			// Unfolded out of the skill's copy, once it lands on the deck.
			const from = r.aboard - D.rise * p;
			if (t < from) return;
			const q = onDeck(this.v);
			this.tile(this.v, 0, 'result', outCubic((t - from) / (r.aboard - from)), q, r.span);
			return;
		}
		if (l.source === 'sub') {
			// Out of the subagent's door, growing to its full size, onto the deck.
			if (t < r.ready) return;
			const k = (t - r.ready) / (r.aboard - r.ready);
			this.a.set(SUB.x1 + 0.22, 0.42, RAIL_WEST_Z);
			onDeck(this.b);
			hop(this.a, this.b, inOut(k), 0.3, this.v);
			this.tile(this.v, cartYaw + Math.PI / 2, 'result', lerp(0.35, 1, outCubic(k)), undefined, r.span);
			return;
		}
		// Out of a bench's slot, standing on top of it until the cart comes back for it.
		const rise = r.ready - D.rise * p;
		if (t < rise) return;
		// Two across the bench's top, piled up: clear of its lamp and its wire's fitting at the far edge.
		const z = BENCHES[l.bench].z;
		const col = l.inBench % 2;
		const layer = Math.floor(l.inBench / 2);
		this.a.set(BENCH.x0 + 0.14 + col * 0.15, BENCH.h + TILE.h / 2 + 0.005 + layer * (TILE.h + 0.01), z);
		const takeFrom = r.aboard - D.take * p;
		if (t < takeFrom) {
			const k = outCubic(clamp((t - rise) / (r.ready - rise)));
			this.v.copy(this.a);
			if (layer === 0) this.v.y -= (1 - k) * (TILE.h + 0.02);
			else this.v.y += (1 - k) * 0.25;
			this.tile(this.v, 0, 'result', layer === 0 ? 1 : k);
			return;
		}
		// Onto the deck.
		const k = (t - takeFrom) / (r.aboard - takeFrom);
		onDeck(this.b);
		hop(this.a, this.b, inOut(k), 0.25, this.v);
		this.tile(this.v, lerp(0, cartYaw + Math.PI / 2, inOut(k)), 'result');
	}

	/* ---------- the cart ---------- */

	private poseCart(s: number, t: number) {
		const g = this.parts.cart.group;
		railPoint(s, g.position);
		const yaw = railYaw(s);
		// Tipping: the deck leans toward the tray while the results go in.
		let lean = 0;
		for (const [a, b] of TILTS) if (t >= a && t < b + 0.02) lean = Math.sin(Math.PI * clamp((t - a) / (b + 0.02 - a))) * 0.22;
		this.euler.set(0, yaw, 0, 'YXZ');
		g.quaternion.setFromEuler(this.euler);
		if (lean) {
			RAIL_PATH.getTangentAt(clamp(s / RAIL_LEN), tmpTan);
			this.q.setFromAxisAngle(tmpTan, -lean * Math.sign(tmpTan.x || 1));
			g.quaternion.premultiply(this.q);
		}
		g.rotation.setFromQuaternion(g.quaternion);
		g.updateMatrix();
		for (const w of this.parts.cart.wheels) w.rotation.y = -s / 0.085;
	}

	/* ---------- the capsule: a copy out to the press, back, and up; down again, empty ---------- */

	private poseCapsule(t: number) {
		const cap = this.parts.capsule;
		const g = cap.group;
		const feeder = this.parts.feeder;
		g.visible = true;
		g.scale.setScalar(1);
		const send = [...TURNS].reverse().find((x) => t >= x.send.out)?.send;
		const rest = () => {
			g.position.set(TUBE.x, CAPSULE.restY, TUBE.z);
			g.rotation.set(0, 0, 0);
		};
		if (!send || t >= send.rest) {
			rest();
			cap.load(trayAt(0), 0);
			return;
		}
		const along = (u: number) => {
			feeder.getPointAt(clamp(u), g.position);
			feeder.getTangentAt(clamp(u), tmpTan);
			g.rotation.set(0, Math.atan2(tmpTan.x, tmpTan.z), 0);
		};
		const tray = trayAt(send.dock);
		if (t < send.dock) {
			along(inOut((t - send.out) / (send.dock - send.out)));
			cap.load(tray, 0);
		} else if (t < send.loaded) {
			along(1);
			cap.load(tray, (t - send.dock) / (send.loaded - send.dock));
		} else if (t < send.home) {
			along(1 - inOut((t - send.loaded) / (send.home - send.loaded)));
			cap.load(tray, 1);
		} else if (t < send.gone) {
			// Stands up in the tube's foot, and is blown up and away.
			const k = (t - send.home) / (send.gone - send.home);
			const stand = clamp(k / 0.3);
			g.position.set(TUBE.x, CAPSULE.restY + Math.max(0, CAPSULE.len / 2 - CAPSULE.r) * inOut(stand) + inCubic(clamp((k - 0.3) / 0.7)) * 14, TUBE.z);
			g.rotation.set(-(Math.PI / 2) * inOut(stand), 0, 0);
			cap.load(tray, 1);
			if (g.position.y > 12) g.scale.setScalar(clamp((15 - g.position.y) / 3));
		} else if (t < send.down) {
			g.visible = false;
		} else {
			// Back down, empty, settling in its seat and lying down again.
			const k = (t - send.down) / (send.rest - send.down);
			const fall = clamp(k / 0.8);
			g.position.set(TUBE.x, CAPSULE.restY + Math.max(0, CAPSULE.len / 2 - CAPSULE.r) + (1 - outCubic(fall)) * 13, TUBE.z);
			g.rotation.set(-Math.PI / 2, 0, 0);
			if (k > 0.8) {
				const lie = inOut((k - 0.8) / 0.2);
				g.position.y = CAPSULE.restY + Math.max(0, CAPSULE.len / 2 - CAPSULE.r) * (1 - lie);
				g.rotation.x = -(Math.PI / 2) * (1 - lie);
			}
			if (g.position.y > 12) g.scale.setScalar(clamp((15 - g.position.y) / 3));
			cap.load(tray, 0);
		}
	}

	/* ---------- the gate: your hook, your rules, and you ---------- */

	private poseGate(t: number, time: number) {
		const { gate } = this.parts;
		let lamp = -1;
		let blink = false;
		let hook = 0;
		let ring = 0;
		let beacon = 0;
		this.hookBead.visible = false;
		for (const k of CARDS) {
			if (t < k.check || t >= k.settled + 0.06 * k.pace) continue;
			if (t < k.hooked) {
				// Your hook runs first: a pulse from the wall along its cable into the gate.
				const f = (t - k.check) / (k.hooked - k.check);
				this.hookBead.visible = true;
				this.parts.hookCable.getPointAt(inOut(f), this.hookBead.position);
				hook = clamp((f - 0.7) / 0.3);
			} else hook = 1;
			if (k.ring !== undefined && t >= k.ring && t < k.answer! + D.answer * Math.max(k.pace, 0.9)) {
				lamp = 1;
				blink = t < k.answer!;
				ring = t < k.answer! ? 1 : 0;
			}
			if (t >= k.verdict) lamp = k.call.verdict === 'deny' ? 2 : 0;
			if (t >= k.verdict && k.call.verdict !== 'deny') beacon = Math.max(beacon, 1 - clamp((t - k.verdict) / (0.06 * k.pace)));
		}
		gate.lamps.forEach((l, i) => {
			const on = i === lamp ? (blink ? 0.5 + 0.5 * Math.sign(Math.sin(time * 14)) : 1) : 0;
			l.set([color.green, color.amber, color.red][i], 0.12 + on * 0.75);
		});
		gate.hookLamp.set(color.cobalt, 0.1 + hook * 0.7);
		gate.beacon.set(color.green, 0.18 + beacon * 0.9);
		// The bell swings while it rings.
		gate.bell.rotation.z = ring ? Math.sin(time * 22) * 0.32 : 0;
	}

	/* ---------- the benches: out along the wire to the real thing, and back ---------- */

	private poseBenches(t: number) {
		const lamps = this.parts.benchLamps;
		const lit = [0, 0, 0];
		this.benchBeads.forEach((b) => (b.visible = false));
		const runs = TURNS.flatMap((x) => x.runs);
		for (const run of runs) {
			if (t < run.from - 0.01 || t >= run.to + 0.03 * run.pace) continue;
			lit[run.bench] = 1;
			const p = run.pace;
			const out = D.pulse * p;
			const inside = this.parts.wires[run.bench * 2];
			const lead = this.parts.wires[run.bench * 2 + 1];
			const back = run.to - out;
			const bead = this.benchBeads[run.bench];
			let f = -1;
			if (t >= run.from && t < run.from + out) f = (t - run.from) / out;
			else if (t >= back && t < run.to) f = 1 - (t - back) / out;
			if (f >= 0) {
				bead.visible = true;
				// The inside wire to the wall, then (past the wall) the lead outside to the thing.
				if (f < 0.55) inside.getPointAt(clamp(f / 0.55), bead.position);
				else lead.getPointAt(clamp((f - 0.55) / 0.45), bead.position);
			}
		}
		// The re-read: your files answer without a call.
		for (const r of REREAD) if (t >= r.ready - D.rise * r.pace - 0.03 && t < r.ready) lit[0] = 1;
		lamps.forEach((l, i) => l.set(lit[i] ? color.green : color.amber, lit[i] ? 0.7 : 0.12));
	}

	/* ---------- the skill: the shelf's card leans out, and its copy comes down to the cart ---------- */

	private poseSkill(t: number) {
		const k = CARDS.find((x) => x.call.where === 'skill');
		const shelfCard = this.parts.skillCards[0];
		this.copy.visible = false;
		shelfCard.rotation.x = -0.08;
		if (!k || k.into === undefined) return;
		const p = k.pace;
		const r = k.results[0];
		const leave = r.ready;
		const land = r.aboard - D.rise * p;
		// The card leans out as the request arrives behind it, and back once its copy has gone.
		const lean = clamp((t - k.into - D.shelf * p * 0.7) / (D.shelf * p * 0.3)) * (1 - clamp((t - leave - D.shelf * p * 0.3) / (D.shelf * p * 0.4)));
		shelfCard.rotation.x = -0.08 + lean * 0.42;
		if (t < leave || t >= land) return;
		const f = (t - leave) / (land - leave);
		this.copy.visible = true;
		this.a.copy(skillAt(0));
		this.a.y += 0.26;
		this.a.z += 0.08;
		this.deckSpot(1, this.b);
		this.b.y += 0.12;
		hop(this.a, this.b, inOut(f), 0.6, this.copy.position);
		// It turns to lie flat as it lands, like a sheet laid on the deck.
		this.copy.rotation.set(-(Math.PI / 2) * inOut(f), 0, 0);
		this.copy.scale.setScalar(lerp(1, 0.9, f));
	}
}

