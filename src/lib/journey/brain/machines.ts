/*
 * The works: what stands in the pockets and channels between the cushions. Each machine is described here by where it
 * sits on the core and how big it is, and from that alone come both things that have to agree: the envelope the
 * cushions are solved to keep clear of, and the frame its parts are built in. So a machine's pocket is cut to fit it,
 * because the pocket and the machine are the same numbers.
 */
import { chartStep, shell, type V3 } from './shell';
import { cross, dot, frame, through, unit, type Ball, type Station } from './solve';

/** A place on the chart. */
export type Spot = [number, number];

export type Machine =
	/** An eye: a ball that turns in a chrome housing of this radius, which stands in a low dish that runs out under the cushions round it. */
	| { kind: 'eye'; name: string; at: Spot; r: number; dish?: number }
	/** Copper wound round a core that follows a line over the core; r is the winding's outer radius. */
	| { kind: 'coil'; name: string; path: Spot[]; r: number }
	/** A chrome pipe along a line, r its radius; part of it is a lit glass sleeve, from and to as shares of its length. */
	| { kind: 'pipe'; name: string; path: Spot[]; r: number; lit?: [number, number] }
	/** A flat chrome arm along a line with a strip of light let into it: half its width, at its start and at its end. Its far end may be held by a link's pivot instead of its own. */
	| { kind: 'arm'; name: string; path: Spot[]; w: [number, number]; held?: boolean }
	/** A block of electronics: its middle, a place it faces along its length, and its size (along, across, tall). */
	| { kind: 'block'; name: string; at: Spot; toward: Spot; size: V3; face: 'bars' | 'fins' | 'cells'; count: number }
	/** Links: flat bars from each pivot to the next. */
	| { kind: 'link'; name: string; pins: Spot[]; r: number };

/** A frame standing on the core: where, the way the core faces, and two directions along it. */
export interface Seat {
	p: V3;
	n: V3;
	t: V3;
	b: V3;
}

const p0: V3 = [0, 0, 0];
const n0: V3 = [0, 0, 0];

/** The frame at a place, turned to face along the core towards another place. */
export function seat(at: Spot, toward?: Spot): Seat {
	const p: V3 = [0, 0, 0];
	const n: V3 = [0, 0, 0];
	shell(at[0], at[1], p, n);
	let d: V3 = [1, 0, 0];
	if (toward) {
		shell(toward[0], toward[1], p0, n0);
		d = [p0[0] - p[0], p0[1] - p[1], p0[2] - p[2]];
	}
	const k = dot(d, n);
	const t = unit([d[0] - n[0] * k, d[1] - n[1] * k, d[2] - n[2] * k]);
	return { p, n, t, b: cross(n, t) };
}

/** A point in a seat's frame: along, up off the core, and to the left. */
export function from(s: Seat, along: number, up: number, left = 0): V3 {
	return [s.p[0] + s.t[0] * along + s.n[0] * up + s.b[0] * left, s.p[1] + s.t[1] * along + s.n[1] * up + s.b[1] * left, s.p[2] + s.t[2] * along + s.n[2] * up + s.b[2] * left];
}

/** A smooth line over the core through some places, as stations evenly spaced about `step` apart. */
export function trace(path: Spot[], step: number): Station[] {
	const fine: Station[] = through(path, 30).map(([u, v]) => ({ u, v, w: 0, p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], b: [0, 0, 0], s: 0 }));
	frame(fine);
	const length = fine[fine.length - 1].s;
	const count = Math.max(2, Math.round(length / step));
	const list: Station[] = [];
	let j = 0;
	for (let i = 0; i <= count; i++) {
		const s = (length * i) / count;
		while (j < fine.length - 2 && fine[j + 1].s < s) j++;
		const a = fine[j];
		const b = fine[j + 1];
		const k = Math.min(1, Math.max(0, (s - a.s) / (b.s - a.s || 1)));
		list.push({ u: a.u + (b.u - a.u) * k, v: a.v + (b.v - a.v) * k, w: 0, p: [0, 0, 0], n: [0, 0, 0], t: [0, 0, 0], b: [0, 0, 0], s: 0 });
	}
	frame(list);
	return list;
}

/** How much wider than itself a machine's envelope is: sleeves on a pipe, flanges on a coil. */
export const SLEEVE = 0.035;

/**
 * Places on the core round a spot: for each of `sides` directions, the place reached by going straight over the core
 * for each distance in turn. So a thing can be made that lies on the core however it curves.
 */
export function spread(at: Spot, radii: number[], sides: number): { p: V3; n: V3 }[][] {
	const s = seat(at);
	const out: { p: V3; n: V3 }[][] = [];
	const jac: number[] = [];
	for (let k = 0; k < sides; k++) {
		const a = (k / sides) * Math.PI * 2;
		let d: V3 = [s.t[0] * Math.cos(a) + s.b[0] * Math.sin(a), s.t[1] * Math.cos(a) + s.b[1] * Math.sin(a), s.t[2] * Math.cos(a) + s.b[2] * Math.sin(a)];
		let [u, v] = at;
		let gone = 0;
		const p: V3 = [0, 0, 0];
		const n: V3 = [0, 0, 0];
		const ray: { p: V3; n: V3 }[] = [];
		for (const r of radii) {
			while (gone < r - 1e-6) {
				shell(u, v, p, n);
				const lift = dot(d, n);
				d = unit([d[0] - n[0] * lift, d[1] - n[1] * lift, d[2] - n[2] * lift]);
				const stride = Math.min(0.05, r - gone);
				const [du, dv] = chartStep(u, v, d[0] * stride, d[1] * stride, d[2] * stride, jac);
				u += du;
				v += dv;
				gone += stride;
			}
			shell(u, v, p, n);
			ray.push({ p: [...p] as V3, n: [...n] as V3 });
		}
		out.push(ray);
	}
	return out;
}

const jac: number[] = [];

/** The balls a machine fills on the core: what the cushions are solved to keep clear of. */
export function envelope(m: Machine): Ball[] {
	const balls: Ball[] = [];
	if (m.kind === 'eye') balls.push({ at: seat(m.at).p, r: m.r });
	else if (m.kind === 'coil' || m.kind === 'pipe') for (const st of trace(m.path, 0.05)) balls.push({ at: st.p, r: m.r + SLEEVE });
	else if (m.kind === 'arm') {
		const line = trace(m.path, 0.07);
		line.forEach((st, i) => balls.push({ at: st.p, r: m.w[0] + ((m.w[1] - m.w[0]) * i) / (line.length - 1) }));
	} else if (m.kind === 'link') {
		for (let j = 0; j < m.pins.length - 1; j++) {
			const a = seat(m.pins[j]);
			const b = seat(m.pins[j + 1]);
			const far = Math.hypot(b.p[0] - a.p[0], b.p[1] - a.p[1], b.p[2] - a.p[2]);
			const n = Math.max(1, Math.ceil(far / 0.05));
			for (let i = 0; i <= n; i++) balls.push({ at: [a.p[0] + ((b.p[0] - a.p[0]) * i) / n, a.p[1] + ((b.p[1] - a.p[1]) * i) / n, a.p[2] + ((b.p[2] - a.p[2]) * i) / n], r: m.r });
		}
	} else {
		// A block's footprint is a rectangle with round corners: balls on a grid over the rectangle drawn in by their radius.
		const s = seat(m.at, m.toward);
		const r = Math.min(0.12, m.size[1] / 2 - 0.01);
		const la = m.size[0] / 2 - r;
		const lb = m.size[1] / 2 - r;
		const na = Math.max(1, Math.ceil((2 * la) / 0.05));
		const nb = Math.max(1, Math.ceil((2 * lb) / 0.05));
		for (let i = 0; i <= na; i++)
			for (let k = 0; k <= nb; k++) {
				const a = -la + (2 * la * i) / na;
				const b = -lb + (2 * lb * k) / nb;
				// Laid onto the core rather than left on the flat of the seat: the core curves away under a big block.
				const [du, dv] = chartStep(m.at[0], m.at[1], s.t[0] * a + s.b[0] * b, s.t[1] * a + s.b[1] * b, s.t[2] * a + s.b[2] * b, jac);
				const at: V3 = [0, 0, 0];
				shell(m.at[0] + du, m.at[1] + dv, at, n0);
				balls.push({ at, r });
			}
	}
	return balls;
}
