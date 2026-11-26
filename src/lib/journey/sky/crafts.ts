import * as THREE from 'three';
import type { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { canvas, friezeTiles, texture } from './persian';

/*
 * Persian crafts of the house and the palace: hand-knotted carpets, aineh-kari mirror work, and Qajar painted tile of
 * roses and nightingales (gol-o-bolbol). These are how Persians have dressed the rooms they live and receive in, not
 * their places of worship, so the world reads as Persian life: a rug under your laptop, a palace gate with mirrored
 * columns, a hall laid with carpets.
 *
 * Every texture is drawn here on a canvas, symmetric as the real thing is, with a seeded random so it comes out the
 * same every time.
 */

export const WOOL = {
	madder: '#9e2329',
	deep: '#6e1620',
	indigo: '#1f3373',
	navy: '#141d45',
	ivory: '#f4e7c8',
	saffron: '#e6a83a',
	rose: '#ec8f82',
	leaf: '#4f8b5c',
	sky: '#7cb6d6'
};

export const PAINT = {
	ground: '#f7eedb',
	rose: '#e7798c',
	roseDeep: '#c23d55',
	roseLight: '#f8c3cb',
	leaf: '#4f9a5e',
	leafDeep: '#2f6b45',
	iris: '#5b62c9',
	yellow: '#f2bd38',
	turquoise: '#1ea7b8',
	cobalt: '#1d4ea8',
	bird: '#5f86c4',
	birdDeep: '#30508f',
	breast: '#f3c656',
	beak: '#e39a2e'
};

/** A seeded random, so a texture is drawn the same on every load. */
function seeded(seed: number) {
	return () => {
		seed = (seed + 0x6d2b79f5) | 0;
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

type G = CanvasRenderingContext2D;

function disc(g: G, x: number, y: number, r: number, fill: string) {
	g.fillStyle = fill;
	g.beginPath();
	g.arc(x, y, r, 0, Math.PI * 2);
	g.fill();
}

/** A little five-petalled flower, as a carpet's field is strewn with. */
function blossom(g: G, x: number, y: number, r: number, petal: string, heart: string) {
	for (let k = 0; k < 5; k++) {
		const a = (k / 5) * Math.PI * 2 - Math.PI / 2;
		disc(g, x + Math.cos(a) * r * 0.52, y + Math.sin(a) * r * 0.52, r * 0.42, petal);
	}
	disc(g, x, y, r * 0.3, heart);
}

/** A rose seen from above: six round petals, two curls of shadow in it, a bright heart. */
function rose(g: G, x: number, y: number, r: number, petal: string, dark: string, heart: string) {
	g.fillStyle = petal;
	for (let k = 0; k < 6; k++) {
		const a = (k / 6) * Math.PI * 2 + 0.3;
		g.beginPath();
		g.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a) * r * 0.45, r * 0.55, r * 0.42, a, 0, Math.PI * 2);
		g.fill();
	}
	g.strokeStyle = dark;
	g.lineCap = 'round';
	g.lineWidth = r * 0.13;
	g.beginPath();
	g.arc(x, y, r * 0.56, 0.4, 2.7);
	g.stroke();
	g.beginPath();
	g.arc(x + r * 0.05, y - r * 0.04, r * 0.32, 3.5, 6.0);
	g.stroke();
	disc(g, x, y, r * 0.15, heart);
}

/** A leaf, from its stalk at (x, y) out along ang. */
function leaf(g: G, x: number, y: number, len: number, ang: number, fill: string, rib?: string) {
	g.save();
	g.translate(x, y);
	g.rotate(ang);
	g.beginPath();
	g.moveTo(0, 0);
	g.quadraticCurveTo(len * 0.5, -len * 0.34, len, 0);
	g.quadraticCurveTo(len * 0.5, len * 0.34, 0, 0);
	g.fillStyle = fill;
	g.fill();
	if (rib) {
		g.strokeStyle = rib;
		g.lineWidth = Math.max(1, len * 0.06);
		g.beginPath();
		g.moveTo(len * 0.1, 0);
		g.lineTo(len * 0.85, 0);
		g.stroke();
	}
	g.restore();
}

/**
 * A lobed ellipse, the outline of a carpet's medallion: scalloped all round, and drawn out to a point at its top and
 * bottom, along the carpet's length.
 */
function lobed(g: G, x: number, y: number, rx: number, ry: number, lobes = 16, depth = 0.06, point = 0.22) {
	g.beginPath();
	const n = 220;
	for (let i = 0; i <= n; i++) {
		const t = (i / n) * Math.PI * 2;
		const s = Math.sin(t);
		const r = 1 + depth * Math.cos(lobes * t) + point * Math.pow(Math.abs(s), 14);
		const px = x + Math.cos(t) * rx * r;
		const py = y + s * ry * r;
		if (i) g.lineTo(px, py);
		else g.moveTo(px, py);
	}
	g.closePath();
}

/** A boteh, the teardrop with its tip curled over (what the West calls paisley), its foot at the origin, a unit tall. */
function boteh(g: G, x: number, y: number, size: number, flip: number, turn: number, fill: string, inner: string, line: string) {
	g.save();
	g.translate(x, y);
	g.rotate(turn);
	g.scale(size * flip, size);
	const path = (k: number) => {
		g.beginPath();
		g.moveTo(0, 0.5 * k);
		g.bezierCurveTo(-0.58 * k, 0.5 * k, -0.62 * k, -0.12 * k, -0.2 * k, -0.36 * k);
		g.bezierCurveTo(0.05 * k, -0.5 * k, 0.32 * k, -0.62 * k, 0.26 * k, -0.9 * k);
		g.bezierCurveTo(0.6 * k, -0.6 * k, 0.55 * k, 0.5 * k, 0, 0.5 * k);
		g.closePath();
	};
	path(1);
	g.fillStyle = fill;
	g.fill();
	g.lineWidth = 0.05;
	g.strokeStyle = line;
	g.stroke();
	g.translate(0.02, 0.08);
	path(0.6);
	g.fillStyle = inner;
	g.fill();
	for (const [dx, dy] of [
		[0, 0.12],
		[-0.12, -0.02],
		[0.1, -0.1]
	])
		disc(g, dx, dy, 0.05, fill);
	g.restore();
}

/**
 * A band of border running along +x from the origin, `len` long and `w` wide (down the canvas): a vine waving along it,
 * roses at its crests and little flowers in its troughs, leaves between.
 */
function vineBand(g: G, len: number, w: number, ground: string, stem: string, rosePetal: string, roseDark: string, flower: string) {
	g.fillStyle = ground;
	g.fillRect(0, 0, len, w);
	const waves = Math.max(2, Math.round(len / (w * 1.5)));
	const step = len / waves;
	const amp = w * 0.2;
	const mid = w / 2;
	g.strokeStyle = stem;
	g.lineWidth = w * 0.06;
	g.lineCap = 'round';
	g.beginPath();
	for (let i = 0; i <= 64 * waves; i++) {
		const x = (i / (64 * waves)) * len;
		const y = mid + Math.sin((x / step) * Math.PI * 2) * amp;
		if (i) g.lineTo(x, y);
		else g.moveTo(x, y);
	}
	g.stroke();
	for (let k = 0; k < waves; k++) {
		const up = k * step + step / 4;
		const down = k * step + (3 * step) / 4;
		leaf(g, up - step * 0.18, mid - amp * 0.4, w * 0.22, Math.PI * 0.85, WOOL.leaf);
		leaf(g, down + step * 0.18, mid + amp * 0.4, w * 0.22, -Math.PI * 0.15, WOOL.leaf);
		rose(g, up, mid - amp * 0.95, w * 0.2, rosePetal, roseDark, WOOL.saffron);
		blossom(g, down, mid + amp * 0.95, w * 0.17, flower, WOOL.madder);
	}
}

/** A narrow guard stripe: a ground with a row of dots alternating two colours. */
function guard(g: G, len: number, w: number, ground: string, a: string, b: string) {
	g.fillStyle = ground;
	g.fillRect(0, 0, len, w);
	const n = Math.max(2, Math.round(len / (w * 1.6)));
	for (let i = 0; i < n; i++) disc(g, ((i + 0.5) / n) * len, w / 2, w * 0.24, i % 2 ? a : b);
}

/** Runs a drawing along each side of a rectangle, inward from its edge: the same band on all four sides, corners mitred. */
function ring(g: G, x0: number, y0: number, x1: number, y1: number, w: number, draw: (len: number) => void) {
	const sides: [number, number, number, number][] = [
		[x0, y0, 0, x1 - x0],
		[x1, y0, Math.PI / 2, y1 - y0],
		[x1, y1, Math.PI, x1 - x0],
		[x0, y1, -Math.PI / 2, y1 - y0]
	];
	for (const [x, y, a, len] of sides) {
		g.save();
		g.translate(x, y);
		g.rotate(a);
		// Mitre the corners: clip to the trapezium this side owns.
		g.beginPath();
		g.moveTo(0, 0);
		g.lineTo(len, 0);
		g.lineTo(len - w, w);
		g.lineTo(w, w);
		g.closePath();
		g.clip();
		draw(len);
		g.restore();
	}
}

export interface RugDesign {
	field: string;
	medallion: string;
	border: string;
	ivory: string;
	accent: string;
}

export const RUGS: Record<'red' | 'blue', RugDesign> = {
	red: { field: WOOL.madder, medallion: WOOL.indigo, border: WOOL.navy, ivory: WOOL.ivory, accent: WOOL.saffron },
	blue: { field: WOOL.indigo, medallion: WOOL.madder, border: WOOL.deep, ivory: WOOL.ivory, accent: WOOL.saffron }
};

/**
 * A carpet's face, `w` by `l` in metres, drawn to scale: its borders (an outer guard, a main border with a vine of
 * roses, an inner guard), and in the field, strewn with little flowers, a lobed medallion with a pendant at each end,
 * quarter medallions in its corners, and boteh between.
 */
export function rugFace(w: number, l: number, d: RugDesign = RUGS.red, seed = 7) {
	// Never taller than a phone will take: a long runner is drawn narrower.
	const W = Math.min(768, Math.round((2048 * w) / l));
	const H = Math.round((W * l) / w);
	const { c, g } = canvas(W, H);
	const u = W / w;
	const runner = l / w > 3;
	const rnd = seeded(seed);
	// The bands, from the edge in, in metres.
	const edge = 0.05 * u;
	const outer = 0.12 * u;
	const main = Math.min(0.5, w * 0.1) * u;
	const inner = 0.1 * u;
	const line = 0.025 * u;
	g.fillStyle = d.border;
	g.fillRect(0, 0, W, H);
	let o = edge;
	ring(g, o, o, W - o, H - o, outer, (len) => guard(g, len, outer, d.ivory, d.field, d.medallion));
	o += outer + line;
	ring(g, o, o, W - o, H - o, main, (len) => vineBand(g, len, main, d.border, d.accent, d.field, WOOL.deep, d.ivory));
	o += main + line;
	ring(g, o, o, W - o, H - o, inner, (len) => guard(g, len, inner, d.accent, d.border, d.field));
	o += inner + line;
	const fx0 = o;
	const fy0 = o;
	const fx1 = W - o;
	const fy1 = H - o;
	const fw = fx1 - fx0;
	const fh = fy1 - fy0;
	const cx = W / 2;
	const cy = H / 2;
	g.save();
	g.beginPath();
	g.rect(fx0, fy0, fw, fh);
	g.clip();
	g.fillStyle = d.field;
	g.fillRect(fx0, fy0, fw, fh);
	// The field's little flowers on a lattice, coloured by their distance from the middle so they come out symmetric.
	const s = 0.32 * u;
	const ni = Math.ceil(fw / s / 2);
	const nj = Math.ceil(fh / s / 2);
	const petals = [d.ivory, d.accent, WOOL.rose, d.medallion];
	for (let i = -ni; i <= ni; i++)
		for (let j = -nj; j <= nj; j++) {
			const x = cx + i * s + ((j & 1) * s) / 2;
			const y = cy + j * s * 0.9;
			const k = (Math.abs(i) + Math.abs(j)) % 4;
			leaf(g, x, y, s * 0.3, -0.6 + (i < 0 ? Math.PI : 0), WOOL.leaf);
			blossom(g, x, y, s * 0.16, petals[k], k === 0 ? d.field : d.ivory);
		}
	if (runner) {
		// A runner: a file of small medallions down its length, a rose between each and the next.
		const n = Math.max(2, Math.round(fh / (fw * 2.3)));
		const step = fh / n;
		for (let k = 0; k < n; k++) {
			const y = fy0 + step * (k + 0.5);
			lobed(g, cx, y, fw * 0.34 + line, fw * 0.5 + line, 8, 0.08, 0.3);
			g.fillStyle = d.ivory;
			g.fill();
			lobed(g, cx, y, fw * 0.34, fw * 0.5, 8, 0.08, 0.3);
			g.fillStyle = d.medallion;
			g.fill();
			lobed(g, cx, y, fw * 0.18, fw * 0.26, 8, 0.1, 0.2);
			g.fillStyle = d.field;
			g.fill();
			blossom(g, cx, y, fw * 0.1, d.accent, d.ivory);
			if (k < n - 1) rose(g, cx, y + step / 2, fw * 0.14, d.ivory, WOOL.deep, d.accent);
		}
		g.restore();
		speckle(g, W, H, rnd);
		return texture(c, false);
	}
	// Quarter medallions in the corners.
	const crx = fw * 0.27;
	const cry = crx * 0.85;
	for (const [x, y] of [
		[fx0, fy0],
		[fx1, fy0],
		[fx0, fy1],
		[fx1, fy1]
	]) {
		lobed(g, x, y, crx + line, cry + line, 12, 0.07, 0);
		g.fillStyle = d.ivory;
		g.fill();
		lobed(g, x, y, crx, cry, 12, 0.07, 0);
		g.fillStyle = d.medallion;
		g.fill();
		lobed(g, x, y, crx * 0.62, cry * 0.62, 10, 0.08, 0);
		g.fillStyle = d.field;
		g.fill();
		for (let k = 0; k < 14; k++) {
			const a = (k / 14) * Math.PI * 2;
			blossom(g, x + Math.cos(a) * crx * 0.8, y + Math.sin(a) * cry * 0.8, s * 0.13, d.ivory, d.accent);
		}
		lobed(g, x, y, crx * 0.3, cry * 0.3, 8, 0.1, 0);
		g.fillStyle = d.ivory;
		g.fill();
	}
	// The medallion, its pendants, and the boteh round it.
	const mrx = fw * 0.3;
	const mry = Math.min(mrx * 1.3, fh * 0.24);
	for (const sy of [-1, 1]) {
		const py = cy + sy * (mry * 1.22 + mrx * 0.2);
		g.strokeStyle = d.ivory;
		g.lineWidth = line * 1.2;
		g.beginPath();
		g.moveTo(cx, cy + sy * mry);
		g.lineTo(cx, py);
		g.stroke();
		lobed(g, cx, py, mrx * 0.28 + line, mrx * 0.2 + line, 8, 0.08, 0.3);
		g.fillStyle = d.ivory;
		g.fill();
		lobed(g, cx, py, mrx * 0.28, mrx * 0.2, 8, 0.08, 0.3);
		g.fillStyle = d.medallion;
		g.fill();
		blossom(g, cx, py, mrx * 0.1, d.accent, d.field);
	}
	lobed(g, cx, cy, mrx + line, mry + line);
	g.fillStyle = d.ivory;
	g.fill();
	lobed(g, cx, cy, mrx, mry);
	g.fillStyle = d.medallion;
	g.fill();
	for (let k = 0; k < 20; k++) {
		const a = (k / 20) * Math.PI * 2;
		const x = cx + Math.cos(a) * mrx * 0.82;
		const y = cy + Math.sin(a) * mry * 0.82;
		leaf(g, x, y, s * 0.24, a + Math.PI / 2, WOOL.leaf);
		blossom(g, x, y, s * 0.13, k % 2 ? d.ivory : d.accent, d.field);
	}
	lobed(g, cx, cy, mrx * 0.64 + line, mry * 0.64 + line, 12, 0.08, 0.3);
	g.fillStyle = d.ivory;
	g.fill();
	lobed(g, cx, cy, mrx * 0.64, mry * 0.64, 12, 0.08, 0.3);
	g.fillStyle = d.field;
	g.fill();
	for (let k = 0; k < 12; k++) {
		const a = (k / 12) * Math.PI * 2;
		blossom(g, cx + Math.cos(a) * mrx * 0.45, cy + Math.sin(a) * mry * 0.45, s * 0.12, k % 2 ? WOOL.rose : d.ivory, d.medallion);
	}
	lobed(g, cx, cy, mrx * 0.26, mry * 0.26, 8, 0.12, 0.2);
	g.fillStyle = d.ivory;
	g.fill();
	rose(g, cx, cy, mrx * 0.17, d.accent, WOOL.deep, d.medallion);
	const bx = fw * 0.3;
	const by = Math.min(fh * 0.3, mry * 1.1);
	for (const sx of [-1, 1])
		for (const sy of [-1, 1]) boteh(g, cx + sx * bx, cy + sy * by, s * 0.9, sx, sy < 0 ? 0 : Math.PI, d.accent, d.field, d.ivory);
	g.restore();
	speckle(g, W, H, rnd);
	return texture(c, false);
}

/** The knots: a fine speckle, lighter and darker, so the pile looks woven up close. */
function speckle(g: G, W: number, H: number, rnd: () => number) {
	for (let i = 0; i < (W * H) / 40; i++) {
		g.fillStyle = rnd() < 0.5 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
		g.fillRect(Math.floor(rnd() * W), Math.floor(rnd() * H), 2, 2);
	}
}

/** Wool fringe: knotted warp ends, ivory, drawn on nothing so only the threads show. Repeats along its length. */
function fringeFace() {
	const W = 256;
	const H = 64;
	const { c, g } = canvas(W, H);
	const rnd = seeded(3);
	g.fillStyle = WOOL.ivory;
	g.fillRect(0, 0, W, 8);
	for (let x = 2; x < W; x += 6) {
		const len = H * (0.72 + rnd() * 0.25);
		g.strokeStyle = rnd() < 0.5 ? WOOL.ivory : '#e8d8b4';
		g.lineWidth = 3;
		g.beginPath();
		g.moveTo(x, 6);
		g.quadraticCurveTo(x + (rnd() - 0.5) * 6, len * 0.5, x + (rnd() - 0.5) * 8, len);
		g.stroke();
	}
	return texture(c);
}

let fringeMat: THREE.MeshStandardMaterial | undefined;
const rugMats = new Map<string, { face: THREE.Material; back: THREE.Material }>();

/**
 * Lays a carpet: its face on a thin slab of pile, the fringe out of each short end. Its middle at `at`, its foot on the
 * floor there, its length along z, turned by `turn` about the vertical.
 */
export function layRug(b: Batch, w: number, l: number, at: [number, number, number], { turn = 0, design = RUGS.red, seed = 7, pile = 0.014 } = {}) {
	const d = design;
	const key = `${w}x${l}:${d.field}:${seed}`;
	let mats = rugMats.get(key);
	if (!mats) {
		mats = {
			face: new THREE.MeshPhysicalMaterial({ map: rugFace(w, l, d, seed), roughness: 0.92, sheen: 0.25, sheenRoughness: 0.6, sheenColor: '#ff9d8a' }),
			back: new THREE.MeshStandardMaterial({ color: d.border, roughness: 0.9 })
		};
		rugMats.set(key, mats);
	}
	fringeMat ??= new THREE.MeshStandardMaterial({ map: fringeFace(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
	const [x, y, z] = at;
	const cos = Math.cos(turn);
	const sin = Math.sin(turn);
	const place = (dx: number, dy: number, dz: number): [number, number, number] => [x + dx * cos + dz * sin, y + dy, z - dx * sin + dz * cos];
	b.add(rbox(w, pile, l, 0.01, 1), mats.back, { p: place(0, pile / 2, 0), r: [0, turn, 0] });
	b.add(new THREE.PlaneGeometry(w, l), mats.face, { p: place(0, pile + 0.001, 0), r: [-Math.PI / 2, 0, turn] });
	// The fringes lie on the floor out of each end, the texture's knotted edge against the carpet.
	const fringe = 0.26;
	for (const s of [-1, 1]) {
		const geo = new THREE.PlaneGeometry(w * 0.96, fringe);
		const uv = geo.attributes.uv as THREE.BufferAttribute;
		for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round((w * 0.96) / 0.5));
		b.add(geo, fringeMat, { p: place(0, 0.006, s * (l / 2 + fringe / 2 - 0.02)), r: [-Math.PI / 2, 0, turn + (s > 0 ? Math.PI : 0)] });
	}
}

/**
 * Aineh-kari: mirror cut small and set in plaster, as in the halls of the old palaces. A sunburst of crystal rays in each
 * repeat, a quarter of one in each corner, and between them a lattice of little diamonds; every piece is tilted a little
 * its own way, so as you move, the pieces catch the sky one by one and the wall glitters. Three maps drawn at once: the
 * colour, the tilt of each piece (a normal map), and which is mirror and which is plaster (rough and metal).
 */
function mirrorMaps() {
	const S = 512;
	const col = canvas(S, S);
	const nrm = canvas(S, S);
	const orm = canvas(S, S);
	const rnd = seeded(11);
	col.g.fillStyle = '#d6cbb6';
	col.g.fillRect(0, 0, S, S);
	nrm.g.fillStyle = 'rgb(128,128,255)';
	nrm.g.fillRect(0, 0, S, S);
	// Plaster: rough, not metal. Mirror: smooth and metal. (Roughness is read from green, metalness from blue.)
	orm.g.fillStyle = 'rgb(0,200,0)';
	orm.g.fillRect(0, 0, S, S);
	// Each piece also gets its own moment to glint, kept in the red of the rough-and-metal map.
	const piece = (path: (g: G) => void, tilt: [number, number], tint = '#dfe7ee') => {
		const [tx, ty] = tilt;
		const tz = Math.sqrt(Math.max(0, 1 - tx * tx - ty * ty));
		const enc = (v: number) => Math.round((v * 0.5 + 0.5) * 255);
		for (const [g, fill] of [
			[col.g, tint],
			[nrm.g, `rgb(${enc(tx)},${enc(ty)},${enc(tz)})`],
			[orm.g, `rgb(${Math.floor(rnd() * 256)},22,255)`]
		] as [G, string][]) {
			path(g);
			g.fillStyle = fill;
			g.fill();
		}
	};
	// Silver, some pieces catching more of the sky than others: the rays brightest, the lattice between them darker, so
	// the suns stand out of it.
	const shade = (lo = 150, hi = 255) => {
		const v = lo + Math.floor(rnd() * (hi - lo));
		return `rgb(${v - 8},${v},${Math.min(255, v + 14)})`;
	};
	const R = S * 0.3;
	const suns: [number, number][] = [
		[S / 2, S / 2],
		[0, 0],
		[S, 0],
		[0, S],
		[S, S]
	];
	const gap = S * 0.006;
	for (const [cx, cy] of suns) {
		const rays = 12;
		for (let k = 0; k < rays; k++) {
			const a = (k / rays) * Math.PI * 2;
			const half = Math.PI / rays - 0.045;
			const r0 = R * 0.2;
			const r1 = k % 2 ? R * 0.82 : R;
			const tip = [cx + Math.cos(a) * r1, cy + Math.sin(a) * r1];
			const root = [cx + Math.cos(a) * r0, cy + Math.sin(a) * r0];
			const gold = k % 2 === 1;
			for (const side of [-1, 1]) {
				const wing = [cx + Math.cos(a + side * half) * R * 0.55, cy + Math.sin(a + side * half) * R * 0.55];
				const out = 0.38;
				piece(
					(g) => {
						g.beginPath();
						g.moveTo(root[0], root[1]);
						g.lineTo(wing[0], wing[1]);
						g.lineTo(tip[0], tip[1]);
						g.closePath();
					},
					[Math.cos(a + (side * Math.PI) / 2) * out, Math.sin(a + (side * Math.PI) / 2) * out],
					gold ? '#f2dca0' : shade(215, 255)
				);
			}
			// A little chip between each pair of rays.
			const mid = a + Math.PI / rays;
			const cr = R * 0.86;
			piece(
				(g) => {
					g.beginPath();
					g.arc(cx + Math.cos(mid) * cr, cy + Math.sin(mid) * cr, R * 0.07, 0, Math.PI * 2);
				},
				[(rnd() - 0.5) * 0.6, (rnd() - 0.5) * 0.6],
				shade(140, 230)
			);
		}
		piece(
			(g) => {
				g.beginPath();
				g.arc(cx, cy, R * 0.16, 0, Math.PI * 2);
			},
			[0, 0],
			'#f6e2a8'
		);
	}
	// The lattice of little diamonds between the suns.
	const d = S / 16;
	for (let i = 0; i <= 16; i++)
		for (let j = 0; j <= 16; j++) {
			const x = i * d + ((j & 1) * d) / 2;
			const y = j * d;
			if (suns.some(([sx, sy]) => Math.hypot(x - sx, y - sy) < R * 1.12)) continue;
			const h = d / 2 - gap;
			piece(
				(g) => {
					g.beginPath();
					g.moveTo(x, y - h);
					g.lineTo(x + h * 0.7, y);
					g.lineTo(x, y + h);
					g.lineTo(x - h * 0.7, y);
					g.closePath();
				},
				[(rnd() - 0.5) * 1.1, (rnd() - 0.5) * 1.1],
				shade(70, 185)
			);
		}
	const map = texture(col.c);
	const normalMap = texture(nrm.c);
	normalMap.colorSpace = THREE.NoColorSpace;
	const ormMap = texture(orm.c);
	ormMap.colorSpace = THREE.NoColorSpace;
	return { map, normalMap, ormMap };
}

let mirror: THREE.MeshStandardMaterial | undefined;
const GLINT = { value: 0 };
/** The clock the mirror work glints by: call it every frame from whatever shows some. */
export const glint = (time: number) => (GLINT.value = time);
/**
 * Mirror work, made once: lay its UVs one repeat to every metre or so. Besides catching the sky as you move, now and
 * then one piece or another flashes, as a mirror does when the light finds it.
 */
export function mirrorWork() {
	if (!mirror) {
		const { map, normalMap, ormMap } = mirrorMaps();
		mirror = new THREE.MeshStandardMaterial({
			map,
			normalMap,
			normalScale: new THREE.Vector2(1, 1),
			roughnessMap: ormMap,
			metalnessMap: ormMap,
			roughness: 1,
			metalness: 1,
			envMapIntensity: 2.4
		});
		mirror.onBeforeCompile = (shader) => {
			shader.uniforms.uGlint = GLINT;
			shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uGlint;').replace(
				'#include <emissivemap_fragment>',
				`#include <emissivemap_fragment>
				vec4 glintOf = texture2D( roughnessMap, vRoughnessMapUv );
				float flash = pow( max( 0.0, sin( uGlint * 1.1 + glintOf.r * 61.0 ) ), 60.0 ) * glintOf.b;
				totalEmissiveRadiance += vec3( 1.0, 0.96, 0.86 ) * flash * 2.2;`
			);
		};
		mirror.customProgramCacheKey = () => 'mirror-work';
	}
	return mirror;
}

/** Scales a geometry's UVs, so a repeating texture lies on it at a size of its own. */
export function tiledUV<T extends THREE.BufferGeometry>(geo: T, su: number, sv = su): T {
	const uv = geo.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
	return geo;
}

/** A nightingale perched, facing right, its feet at (x, y), `s` from tail to beak. */
function bird(g: G, x: number, y: number, s: number, flip = 1) {
	g.save();
	g.translate(x, y);
	g.scale(s * flip, s);
	g.translate(0, -0.32);
	// The tail, down and back.
	g.beginPath();
	g.moveTo(-0.38, 0.02);
	g.lineTo(-0.92, 0.36);
	g.lineTo(-0.84, 0.46);
	g.lineTo(-0.3, 0.16);
	g.closePath();
	g.fillStyle = PAINT.birdDeep;
	g.fill();
	// The body, its yellow breast, the wing over it.
	g.beginPath();
	g.ellipse(0, 0, 0.46, 0.27, -0.25, 0, Math.PI * 2);
	g.fillStyle = PAINT.bird;
	g.fill();
	g.beginPath();
	g.ellipse(0.14, 0.08, 0.3, 0.17, -0.35, 0, Math.PI * 2);
	g.fillStyle = PAINT.breast;
	g.fill();
	g.beginPath();
	g.ellipse(-0.08, -0.03, 0.3, 0.14, -0.4, 0, Math.PI * 2);
	g.fillStyle = PAINT.birdDeep;
	g.fill();
	g.strokeStyle = PAINT.ground;
	g.lineWidth = 0.025;
	for (const k of [0, 1, 2]) {
		g.beginPath();
		g.moveTo(-0.28 + k * 0.1, -0.06 + k * 0.02);
		g.lineTo(-0.02 + k * 0.08, -0.12 + k * 0.03);
		g.stroke();
	}
	// The head, its beak open in song, its eye.
	disc(g, 0.4, -0.22, 0.17, PAINT.birdDeep);
	g.beginPath();
	g.moveTo(0.54, -0.27);
	g.lineTo(0.78, -0.3);
	g.lineTo(0.56, -0.2);
	g.lineTo(0.74, -0.14);
	g.lineTo(0.52, -0.16);
	g.closePath();
	g.fillStyle = PAINT.beak;
	g.fill();
	disc(g, 0.44, -0.25, 0.05, '#ffffff');
	disc(g, 0.45, -0.25, 0.028, '#1b1b2a');
	// Its feet, on the branch.
	g.strokeStyle = '#6b4a2b';
	g.lineWidth = 0.035;
	for (const fx of [-0.02, 0.1]) {
		g.beginPath();
		g.moveTo(fx, 0.22);
		g.lineTo(fx - 0.03, 0.32);
		g.stroke();
	}
	g.restore();
}

/** A tulip, from its stem's foot at (x, y), `h` tall, leaning by `lean`. */
function tulip(g: G, x: number, y: number, h: number, lean: number, petal: string) {
	const tx = x + Math.sin(lean) * h;
	const ty = y - Math.cos(lean) * h;
	g.strokeStyle = PAINT.leafDeep;
	g.lineWidth = h * 0.05;
	g.beginPath();
	g.moveTo(x, y);
	g.quadraticCurveTo(x + Math.sin(lean) * h * 0.3, y - h * 0.6, tx, ty);
	g.stroke();
	leaf(g, x + Math.sin(lean) * h * 0.15, y - h * 0.3, h * 0.45, -Math.PI / 2 - 0.6 + lean, PAINT.leaf, PAINT.leafDeep);
	g.save();
	g.translate(tx, ty);
	g.rotate(lean);
	const r = h * 0.17;
	g.fillStyle = petal;
	g.beginPath();
	g.moveTo(-r, 0);
	g.quadraticCurveTo(-r * 1.05, -r * 1.4, -r * 0.5, -r * 1.9);
	g.lineTo(-r * 0.15, -r * 1.2);
	g.lineTo(0, -r * 2);
	g.lineTo(r * 0.15, -r * 1.2);
	g.lineTo(r * 0.5, -r * 1.9);
	g.quadraticCurveTo(r * 1.05, -r * 1.4, r, 0);
	g.quadraticCurveTo(0, r * 0.5, -r, 0);
	g.fill();
	g.restore();
}

/**
 * A painted tile panel, Qajar style: on a cream ground in a turquoise frame, a rose bush with tulips at its feet and a
 * nightingale singing in it. `aspect` is its width over its height.
 */
export function gulPanel(aspect = 0.6, seed = 5, flip = 1) {
	const W = 384;
	const H = Math.round(W / aspect);
	const { c, g } = canvas(W, H);
	const rnd = seeded(seed);
	g.fillStyle = PAINT.turquoise;
	g.fillRect(0, 0, W, H);
	g.fillStyle = PAINT.ground;
	g.fillRect(14, 14, W - 28, H - 28);
	g.strokeStyle = PAINT.cobalt;
	g.lineWidth = 4;
	g.strokeRect(22, 22, W - 44, H - 44);
	g.save();
	g.beginPath();
	g.rect(24, 24, W - 48, H - 48);
	g.clip();
	if (flip < 0) {
		g.translate(W, 0);
		g.scale(-1, 1);
	}
	const foot = H - 40;
	// The bush: stems up from the foot, branching, leaves along them, roses at their ends.
	const ends: [number, number][] = [];
	const stem = (x0: number, y0: number, x1: number, y1: number, bend: number) => {
		g.strokeStyle = PAINT.leafDeep;
		g.lineWidth = 8;
		g.beginPath();
		g.moveTo(x0, y0);
		g.quadraticCurveTo((x0 + x1) / 2 + bend, (y0 + y1) / 2, x1, y1);
		g.stroke();
		for (let t = 0.18; t < 0.92; t += 0.12) {
			const lx = (1 - t) * (1 - t) * x0 + 2 * (1 - t) * t * ((x0 + x1) / 2 + bend) + t * t * x1;
			const ly = (1 - t) * (1 - t) * y0 + 2 * (1 - t) * t * ((y0 + y1) / 2) + t * t * y1;
			leaf(g, lx, ly, 38 + rnd() * 14, (rnd() < 0.5 ? -1 : 1) * (0.5 + rnd() * 0.6) - Math.PI / 2 + (rnd() < 0.5 ? 0 : Math.PI), PAINT.leaf, PAINT.leafDeep);
		}
		ends.push([x1, y1]);
	};
	const mx = W / 2;
	stem(mx, foot, mx - W * 0.2, H * 0.36, -30);
	stem(mx, foot, mx + W * 0.18, H * 0.24, 40);
	stem(mx, foot, mx - W * 0.05, H * 0.14, 10);
	stem(mx, foot - H * 0.15, mx + W * 0.28, H * 0.52, 30);
	const colours = [PAINT.rose, PAINT.roseDeep, PAINT.roseLight, PAINT.rose];
	ends.forEach(([x, y], i) => rose(g, x, y, 44 + (i % 2) * 8, colours[i], PAINT.roseDeep, PAINT.yellow));
	// Buds.
	for (const [x, y] of [
		[mx - W * 0.3, H * 0.5],
		[mx + W * 0.06, H * 0.38]
	]) {
		g.beginPath();
		g.ellipse(x, y, 14, 20, 0.3, 0, Math.PI * 2);
		g.fillStyle = PAINT.roseDeep;
		g.fill();
		leaf(g, x, y + 14, 26, Math.PI / 2 + 0.6, PAINT.leaf);
	}
	tulip(g, mx - W * 0.3, foot, H * 0.22, -0.15, PAINT.iris);
	tulip(g, mx + W * 0.3, foot, H * 0.18, 0.2, PAINT.roseDeep);
	tulip(g, mx + W * 0.08, foot, H * 0.12, 0.1, PAINT.yellow);
	// The ground the bush grows from.
	g.fillStyle = PAINT.leafDeep;
	g.beginPath();
	g.ellipse(mx, foot + 6, W * 0.42, 12, 0, 0, Math.PI * 2);
	g.fill();
	// The nightingale, on the right-hand branch.
	bird(g, mx + W * 0.07, H * 0.47, W * 0.32);
	g.restore();
	return texture(c, false);
}

/** A frieze of painted tile: a scroll of roses along a cream band, a nightingale in every repeat, cobalt rules. */
export function gulFrieze(seed = 9) {
	const W = 1024;
	const H = 160;
	const { c, g } = canvas(W, H);
	const rnd = seeded(seed);
	g.fillStyle = PAINT.ground;
	g.fillRect(0, 0, W, H);
	const mid = H / 2;
	const amp = H * 0.18;
	g.strokeStyle = PAINT.leafDeep;
	g.lineWidth = 5;
	g.beginPath();
	for (let x = 0; x <= W; x += 4) {
		const y = mid + Math.sin((x / W) * Math.PI * 4) * amp;
		if (x) g.lineTo(x, y);
		else g.moveTo(x, y);
	}
	g.stroke();
	for (let k = 0; k < 4; k++) {
		const x = ((k + 0.25) / 4) * W;
		const up = k % 2 === 0;
		const y = mid + (up ? -amp : amp);
		for (let j = 0; j < 3; j++) leaf(g, x - 30 + j * 30, y + (up ? 14 : -14), 22 + rnd() * 8, (up ? 1 : -1) * (0.6 + j * 0.6), PAINT.leaf, PAINT.leafDeep);
		if (k === 1) bird(g, x, y - 4, 92, -1);
		else rose(g, x, y, 24, k === 3 ? PAINT.roseDeep : PAINT.rose, PAINT.roseDeep, PAINT.yellow);
		blossom(g, x + W / 8, mid + (up ? amp : -amp) * 0.4, 9, PAINT.iris, PAINT.yellow);
	}
	g.fillStyle = PAINT.cobalt;
	g.fillRect(0, 0, W, 12);
	g.fillRect(0, H - 12, W, 12);
	g.fillStyle = PAINT.yellow;
	g.fillRect(0, 12, W, 4);
	g.fillRect(0, H - 16, W, 4);
	return texture(c);
}

/**
 * Wall tile of flowers, haft-rangi: square turquoise tiles in white joints, a rose spray on each and a little white
 * blossom where four meet. A repeat is two tiles square, a spray in its middle and quarter sprays at its corners, so
 * set out from a window's middle it puts a spray there.
 */
export function flowerTiles() {
	const S = 512;
	const { c, g } = canvas(S, S);
	g.fillStyle = PAINT.turquoise;
	g.fillRect(0, 0, S, S);
	const spray = (x: number, y: number, r: number) => {
		for (let k = 0; k < 4; k++) {
			const a = Math.PI / 4 + (k * Math.PI) / 2;
			leaf(g, x, y, r * 1.25, a, PAINT.leafDeep, PAINT.leaf);
			blossom(g, x + Math.cos(a) * r * 1.35, y + Math.sin(a) * r * 1.35, r * 0.32, '#ffffff', PAINT.yellow);
		}
		for (let k = 0; k < 4; k++) {
			const a = (k * Math.PI) / 2;
			g.strokeStyle = PAINT.cobalt;
			g.lineWidth = r * 0.08;
			g.beginPath();
			g.moveTo(x, y);
			g.quadraticCurveTo(x + Math.cos(a + 0.4) * r * 0.6, y + Math.sin(a + 0.4) * r * 0.6, x + Math.cos(a) * r * 1.05, y + Math.sin(a) * r * 1.05);
			g.stroke();
			disc(g, x + Math.cos(a) * r * 1.1, y + Math.sin(a) * r * 1.1, r * 0.14, PAINT.cobalt);
		}
		rose(g, x, y, r * 0.62, PAINT.rose, PAINT.roseDeep, PAINT.yellow);
	};
	for (const [x, y] of [
		[S / 2, S / 2],
		[0, 0],
		[S, 0],
		[0, S],
		[S, S]
	])
		spray(x, y, S * 0.15);
	// The joints, and a white blossom where four tiles meet, half way between the sprays.
	g.fillStyle = 'rgba(255,255,255,0.55)';
	for (const t of [S / 4, (3 * S) / 4]) {
		g.fillRect(t - 2, 0, 4, S);
		g.fillRect(0, t - 2, S, 4);
	}
	for (const x of [S / 4, (3 * S) / 4]) for (const y of [S / 4, (3 * S) / 4]) blossom(g, x, y, S * 0.035, '#ffffff', PAINT.roseDeep);
	return texture(c);
}

/** The dado under it: cobalt tile, a white tulip on each, in joints of turquoise. */
export function tulipTiles() {
	const S = 512;
	const { c, g } = canvas(S, S);
	g.fillStyle = PAINT.cobalt;
	g.fillRect(0, 0, S, S);
	for (const [x, y] of [
		[S / 4, S / 4],
		[(3 * S) / 4, S / 4],
		[S / 4, (3 * S) / 4],
		[(3 * S) / 4, (3 * S) / 4]
	]) {
		tulip(g, x, y + S * 0.15, S * 0.28, 0, '#ffffff');
		disc(g, x - S * 0.15, y - S * 0.15, S * 0.02, PAINT.yellow);
	}
	g.fillStyle = PAINT.turquoise;
	for (const t of [0, S / 2, S]) {
		g.fillRect(t - 3, 0, 6, S);
		g.fillRect(0, t - 3, S, 6);
	}
	return texture(c);
}

/** A floor of square bricks, as a Persian house's courtyard is paved: warm terracotta in pale joints, each a little its own shade. */
export function brickFloor() {
	const S = 512;
	const { c, g } = canvas(S, S);
	const rnd = seeded(21);
	g.fillStyle = '#ead9b8';
	g.fillRect(0, 0, S, S);
	const n = 4;
	const b = S / n;
	for (let i = 0; i < n; i++)
		for (let j = 0; j < n; j++) {
			const k = Math.floor(rnd() * 26) - 13;
			g.fillStyle = `rgb(${206 + k},${142 + k},${100 + k})`;
			g.fillRect(i * b + 4, j * b + 4, b - 8, b - 8);
		}
	speckle(g, S, S, rnd);
	return texture(c);
}

const glazeOf = (map: THREE.Texture) => new THREE.MeshPhysicalMaterial({ map, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.1 });
let paints: ReturnType<typeof makePaints> | undefined;
function makePaints() {
	return {
		/** The walls' field: turquoise tile, a rose spray on each. */
		field: glazeOf(flowerTiles()),
		/** The dado: cobalt tile, a white tulip on each. */
		dado: glazeOf(tulipTiles()),
		/** The frieze along a wall's top: roses and a nightingale on cream. */
		frieze: glazeOf(gulFrieze()),
		/** A narrow band: a chain of red and yellow on navy, for the low border and round the windows. */
		band: glazeOf(friezeTiles())
	};
}
/** The painted tile every palace room shares, made once. */
export const painted = () => (paints ??= makePaints());

const panels = new Map<string, THREE.Material>();
/** A painted tile panel's material (see gulPanel), made once for each shape and each way round. */
export function panelOf(aspect: number, seed = 5, flip = 1) {
	const key = `${aspect.toFixed(3)}:${seed}:${flip}`;
	let m = panels.get(key);
	if (!m) panels.set(key, (m = glazeOf(gulPanel(aspect, seed, flip))));
	return m;
}

let brick: THREE.MeshStandardMaterial | undefined;
/** Brick, as the floor's, for a building's footing: lay its UVs one repeat to every 1.7 metres. */
export const brickWork = () => (brick ??= new THREE.MeshStandardMaterial({ map: brickFloor(), roughness: 0.78 }));

/** A faceted shaft: a cylinder with flat faces, each catching the light its own way, as a mirror-clad column's do. */
export function facetedShaft(rTop: number, rBottom: number, h: number, sides = 8) {
	const geo = new THREE.CylinderGeometry(rTop, rBottom, h, sides, 1, true).toNonIndexed();
	geo.computeVertexNormals();
	return geo;
}
