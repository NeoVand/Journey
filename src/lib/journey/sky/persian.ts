import * as THREE from 'three';

/*
 * The hall's glazed tile and coloured glass, drawn as Persian tilework is: a field of eight-pointed stars and crosses
 * (the star-and-cross of Kashan and Isfahan) in cobalt and turquoise, outlined in white, each star with a yellow and red
 * rosette at its heart; a dado of lozenges below it, bordered by friezes of red and yellow; a floor of larger stars; and
 * windows of orosi, a lattice of dark wood holding red, yellow, blue, green and turquoise glass, a sunburst in the head.
 * Every texture repeats seamlessly: a star cut by one edge is finished by the opposite one.
 */

export const TILE = {
	cobalt: '#1d4ea8',
	navy: '#112a63',
	ink: '#0b1c45',
	turquoise: '#1ea7b8',
	turquoiseLight: '#62d2da',
	white: '#f6f1e4',
	ivory: '#efe4c8',
	yellow: '#f2bd38',
	ochre: '#d7952a',
	red: '#c8392d',
	green: '#2f915c'
};

function canvas(w: number, h: number) {
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	return { c, g: c.getContext('2d')! };
}

function texture(c: HTMLCanvasElement, repeat = true) {
	const t = new THREE.CanvasTexture(c);
	if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 8;
	return t;
}

/** An eight-pointed star, two squares laid over each other: its points at radius r, its notches between. */
function star(g: CanvasRenderingContext2D, x: number, y: number, r: number, turn = 0) {
	const notch = (r * Math.SQRT1_2) / Math.cos(Math.PI / 8);
	g.beginPath();
	for (let k = 0; k < 16; k++) {
		const a = turn + (k * Math.PI) / 8;
		const rr = k % 2 ? notch : r;
		const px = x + Math.cos(a) * rr;
		const py = y + Math.sin(a) * rr;
		if (k) g.lineTo(px, py);
		else g.moveTo(px, py);
	}
	g.closePath();
}

/** A rosette: eight white petals round a yellow heart with a red eye. */
function rosette(g: CanvasRenderingContext2D, x: number, y: number, r: number, petal = TILE.white) {
	g.fillStyle = petal;
	for (let k = 0; k < 8; k++) {
		const a = (k * Math.PI) / 4;
		g.beginPath();
		g.ellipse(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.42, r * 0.17, a, 0, Math.PI * 2);
		g.fill();
	}
	g.fillStyle = TILE.yellow;
	g.beginPath();
	g.arc(x, y, r * 0.3, 0, Math.PI * 2);
	g.fill();
	g.fillStyle = TILE.red;
	g.beginPath();
	g.arc(x, y, r * 0.13, 0, Math.PI * 2);
	g.fill();
}

/** A lozenge, its points up, down and to the sides. */
function lozenge(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
	g.beginPath();
	g.moveTo(x, y - h);
	g.lineTo(x + w, y);
	g.lineTo(x, y + h);
	g.lineTo(x - w, y);
	g.closePath();
}

/** A little gloss on a glazed piece, as a lamp catches it: a soft light toward its top left. */
function glaze(g: CanvasRenderingContext2D, x: number, y: number, r: number, k = 0.16) {
	const shine = g.createRadialGradient(x - r * 0.35, y - r * 0.4, 0, x - r * 0.35, y - r * 0.4, r * 1.1);
	shine.addColorStop(0, `rgba(255,255,255,${k})`);
	shine.addColorStop(1, 'rgba(255,255,255,0)');
	g.fillStyle = shine;
	g.fill();
}

/**
 * The star-and-cross field. Stars sit on a checkerboard, tip to tip along the diagonals, and the crosses are what's
 * left between them. One repeat holds a whole star in its middle and a quarter of one in each corner.
 */
function starField(S: number, colours: { star: string; inner: string; cross: string; line: string; innerLine: string; petal: string; crossMark: string }) {
	const { c, g } = canvas(S, S);
	const a = S / 2;
	g.fillStyle = colours.cross;
	g.fillRect(0, 0, S, S);
	const R = a * Math.SQRT1_2;
	const centres: [number, number][] = [
		[0, 0],
		[S, 0],
		[0, S],
		[S, S],
		[a, a]
	];
	// The crosses first, so the stars' outlines lie over their edges: each with a red lozenge and four white leaves.
	for (const [x, y] of [
		[a, 0],
		[0, a],
		[S, a],
		[a, S]
	] as [number, number][]) {
		g.fillStyle = TILE.white;
		for (let k = 0; k < 4; k++) {
			const ang = (k * Math.PI) / 2;
			g.beginPath();
			g.ellipse(x + Math.cos(ang) * a * 0.2, y + Math.sin(ang) * a * 0.2, a * 0.1, a * 0.04, ang, 0, Math.PI * 2);
			g.fill();
		}
		lozenge(g, x, y, a * 0.1, a * 0.1);
		g.fillStyle = colours.crossMark;
		g.fill();
		g.lineWidth = S * 0.006;
		g.strokeStyle = TILE.yellow;
		g.stroke();
	}
	for (const [x, y] of centres) {
		star(g, x, y, R);
		g.fillStyle = colours.star;
		g.fill();
		glaze(g, x, y, R);
		g.lineWidth = S * 0.012;
		g.strokeStyle = colours.line;
		g.lineJoin = 'round';
		g.stroke();
		star(g, x, y, R * 0.6, Math.PI / 8);
		g.fillStyle = colours.inner;
		g.fill();
		g.lineWidth = S * 0.006;
		g.strokeStyle = colours.innerLine;
		g.stroke();
		rosette(g, x, y, R * 0.36, colours.petal);
	}
	return c;
}

/** The walls' field: cobalt stars, turquoise crosses, white lines, yellow and red at their hearts. */
export function wallTiles() {
	return texture(
		starField(1024, { star: TILE.cobalt, inner: TILE.navy, cross: TILE.turquoise, line: TILE.white, innerLine: TILE.yellow, petal: TILE.white, crossMark: TILE.red })
	);
}

/** The floor: bigger, quieter stars, navy with turquoise hearts, on ivory crosses, outlined in ochre. */
export function floorTiles() {
	return texture(
		starField(1024, { star: TILE.navy, inner: TILE.turquoise, cross: TILE.ivory, line: TILE.ochre, innerLine: TILE.white, petal: TILE.ivory, crossMark: TILE.cobalt })
	);
}

/** The dado: turquoise and cobalt lozenges in white lines, a red point where four meet. */
export function dadoTiles() {
	const S = 512;
	const { c, g } = canvas(S, S);
	g.fillStyle = TILE.white;
	g.fillRect(0, 0, S, S);
	const h = S / 2;
	const cells: [number, number, string][] = [
		[h, h, TILE.turquoise],
		[0, 0, TILE.cobalt],
		[S, 0, TILE.cobalt],
		[0, S, TILE.cobalt],
		[S, S, TILE.cobalt]
	];
	for (const [x, y, fill] of cells) {
		lozenge(g, x, y, h - 10, h - 10);
		g.fillStyle = fill;
		g.fill();
		glaze(g, x, y, h * 0.8, 0.12);
		lozenge(g, x, y, h * 0.42, h * 0.42);
		g.fillStyle = fill === TILE.turquoise ? TILE.navy : TILE.turquoiseLight;
		g.fill();
		rosette(g, x, y, h * 0.22);
	}
	for (const [x, y] of [
		[h, 0],
		[0, h],
		[S, h],
		[h, S]
	] as [number, number][]) {
		lozenge(g, x, y, 14, 14);
		g.fillStyle = TILE.red;
		g.fill();
	}
	return texture(c);
}

/** A border: a navy band with a red and yellow chain of lozenges, white rules along both edges. Repeats along its length. */
export function friezeTiles() {
	const W = 512;
	const H = 128;
	const { c, g } = canvas(W, H);
	g.fillStyle = TILE.navy;
	g.fillRect(0, 0, W, H);
	g.fillStyle = TILE.white;
	g.fillRect(0, 8, W, 8);
	g.fillRect(0, H - 16, W, 8);
	for (let i = 0; i < 4; i++) {
		const x = (i + 0.5) * (W / 4);
		lozenge(g, x, H / 2, W / 8 - 6, H / 2 - 24);
		g.fillStyle = i % 2 ? TILE.red : TILE.yellow;
		g.fill();
		lozenge(g, x, H / 2, W / 16, H / 4 - 10);
		g.fillStyle = TILE.turquoise;
		g.fill();
		g.fillStyle = TILE.white;
		g.beginPath();
		g.arc(x, H / 2, 6, 0, Math.PI * 2);
		g.fill();
	}
	return texture(c);
}

/** How tall a pointed arch's head is, for its width: a little more than a round arch's half, so it comes to a point. */
export const ARCH_RISE = 0.74;

/**
 * A pointed arch, w wide and h high, its foot at y = 0: straight sides up to the spring, then two arcs that meet in a
 * point, each struck from a centre on the far side of the middle.
 */
export function pointedArch(w: number, h: number, rise = w * ARCH_RISE) {
	const spring = h - rise;
	const rho = (w * w) / 4 / w + (rise * rise) / w;
	const cx = -w / 2 + rho;
	const top = Math.atan2(rise, -cx);
	const s = new THREE.Shape();
	s.moveTo(-w / 2, 0);
	s.lineTo(-w / 2, spring);
	s.absarc(cx, spring, rho, Math.PI, top, true);
	s.absarc(-cx, spring, rho, Math.PI - top, 0, true);
	s.lineTo(w / 2, 0);
	s.closePath();
	return s;
}

/**
 * A frame round a pointed arch, t wide, open at the foot: one band from the outer foot on the left, over the head and
 * down, back up inside and over again. A frame drawn as an arch with an arch-shaped hole would share its foot with the
 * hole, and fill in solid.
 */
export function archFrame(w: number, h: number, t: number, rise = w * ARCH_RISE) {
	const outer = pointedArch(w + t * 2, h + t, rise + t).getPoints(10);
	const inner = pointedArch(w, h, rise).getPoints(10);
	// Each runs from its left foot round to its right foot and back: drop the closing return.
	const out = outer.slice(0, -1);
	const back = inner.slice(0, -1).reverse();
	return new THREE.Shape([...out, ...back]);
}

/** The same arch as a hole in something: a Path, wound the other way. */
export function pointedArchHole(w: number, h: number, x: number, y: number, rise = w * ARCH_RISE) {
	const pts = pointedArch(w, h, rise)
		.getPoints(10)
		.map((p) => new THREE.Vector2(p.x + x, p.y + y))
		.reverse();
	return new THREE.Path(pts);
}

/** A shape's flat face, with its UVs running 0 to 1 across its own box: for a picture drawn to fit it. */
export function fitted(shape: THREE.Shape, segments = 10) {
	const geo = new THREE.ShapeGeometry(shape, segments);
	geo.computeBoundingBox();
	const b = geo.boundingBox!;
	const pos = geo.attributes.position as THREE.BufferAttribute;
	const uv = geo.attributes.uv as THREE.BufferAttribute;
	for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) - b.min.x) / (b.max.x - b.min.x), (pos.getY(i) - b.min.y) / (b.max.y - b.min.y));
	return geo;
}

const GLASS = [TILE.red, TILE.yellow, '#2b5fd9', TILE.green, TILE.turquoise];

/**
 * Orosi: coloured glass in a lattice of dark wood, drawn to fill a pointed arch's box. A sunburst in the head; below,
 * three columns of panes, each with a lozenge set in it; the middle column's panes clear, so the sky shows through.
 */
export function orosi(aspect = 0.5, rise = ARCH_RISE) {
	const W = 512;
	const H = Math.round(W / aspect);
	const { c, g } = canvas(W, H);
	// The canvas counts down from the head: the arch's spring line is its rise below the top.
	const spring = rise * W;
	const wood = '#3a2412';
	const pane = (fill: string, alpha: number) => {
		g.globalAlpha = alpha;
		g.fillStyle = fill;
		g.fill();
		g.globalAlpha = 1;
	};
	// The head: rays out from a little half-sun at the spring line's middle.
	const rays = 9;
	for (let i = 0; i < rays; i++) {
		const a0 = Math.PI + (i / rays) * Math.PI;
		const a1 = Math.PI + ((i + 1) / rays) * Math.PI;
		g.beginPath();
		g.moveTo(W / 2, spring);
		g.arc(W / 2, spring, H, a0, a1);
		g.closePath();
		pane(GLASS[i % GLASS.length], 0.72);
	}
	g.beginPath();
	g.arc(W / 2, spring, W * 0.16, Math.PI, 0);
	g.closePath();
	pane(TILE.yellow, 0.9);
	// The body: three columns of panes, each with a lozenge in it, the middle column clear glass.
	const cols = 3;
	const rows = 6;
	const cw = W / cols;
	const rh = (H - spring) / rows;
	const rowY = (r: number) => spring + r * rh;
	for (let r = 0; r < rows; r++)
		for (let k = 0; k < cols; k++) {
			const clear = k === 1;
			g.beginPath();
			g.rect(k * cw, rowY(r), cw, rh);
			pane(clear ? '#dff2ff' : GLASS[(r + k * 2) % GLASS.length], clear ? 0.14 : 0.66);
			lozenge(g, (k + 0.5) * cw, rowY(r + 0.5), cw * 0.3, rh * 0.32);
			pane(clear ? GLASS[r % GLASS.length] : GLASS[(r + k * 2 + 2) % GLASS.length], 0.85);
		}
	// The wood: every pane's frame, the rays, the half-sun's rim, and a heavier frame round it all.
	g.strokeStyle = wood;
	g.lineCap = 'round';
	g.lineWidth = 9;
	for (let k = 1; k < cols; k++) {
		g.beginPath();
		g.moveTo(k * cw, spring);
		g.lineTo(k * cw, H);
		g.stroke();
	}
	for (let r = 0; r < rows; r++) {
		g.beginPath();
		g.moveTo(0, rowY(r));
		g.lineTo(W, rowY(r));
		g.stroke();
	}
	for (let r = 0; r < rows; r++)
		for (let k = 0; k < cols; k++) {
			lozenge(g, (k + 0.5) * cw, rowY(r + 0.5), cw * 0.3, rh * 0.32);
			g.lineWidth = 6;
			g.stroke();
		}
	g.lineWidth = 8;
	for (let i = 1; i < rays; i++) {
		const a = Math.PI + (i / rays) * Math.PI;
		g.beginPath();
		g.moveTo(W / 2 + Math.cos(a) * W * 0.16, spring + Math.sin(a) * W * 0.16);
		g.lineTo(W / 2 + Math.cos(a) * H, spring + Math.sin(a) * H);
		g.stroke();
	}
	g.beginPath();
	g.arc(W / 2, spring, W * 0.16, Math.PI, 0);
	g.stroke();
	g.lineWidth = 22;
	g.strokeRect(0, 0, W, H);
	// Flipped so its top is the arch's head: a canvas counts down, a texture up.
	return texture(c, false);
}

/** A round window: the same glass, as a rose of sixteen petals round a yellow heart, in a ring of wood. */
export function roseWindow() {
	const S = 512;
	const { c, g } = canvas(S, S);
	const m = S / 2;
	const petals = 16;
	for (let i = 0; i < petals; i++) {
		const a0 = (i / petals) * Math.PI * 2;
		const a1 = ((i + 1) / petals) * Math.PI * 2;
		g.beginPath();
		g.moveTo(m, m);
		g.arc(m, m, m, a0, a1);
		g.closePath();
		g.globalAlpha = 0.72;
		g.fillStyle = GLASS[i % GLASS.length];
		g.fill();
	}
	g.globalAlpha = 1;
	star(g, m, m, m * 0.5);
	g.globalAlpha = 0.85;
	g.fillStyle = TILE.cobalt;
	g.fill();
	g.globalAlpha = 1;
	g.lineWidth = 8;
	g.strokeStyle = '#3a2412';
	g.stroke();
	rosette(g, m, m, m * 0.3);
	for (let i = 0; i < petals; i++) {
		const a = (i / petals) * Math.PI * 2;
		g.beginPath();
		g.moveTo(m + Math.cos(a) * m * 0.5, m + Math.sin(a) * m * 0.5);
		g.lineTo(m + Math.cos(a) * m, m + Math.sin(a) * m);
		g.stroke();
	}
	g.beginPath();
	g.arc(m, m, m - 6, 0, Math.PI * 2);
	g.lineWidth = 14;
	g.stroke();
	return texture(c, false);
}

/**
 * Glass to put a lattice texture in: lit from within a little, the sky through its clear panes. Set against a wall
 * (backed), it's drawn solid: the panes' colours as they are, the clear ones pale, as glass lit from inside looks.
 */
export function stainedGlass(map: THREE.Texture, backed = false) {
	return new THREE.MeshStandardMaterial({
		map,
		emissive: '#ffffff',
		emissiveMap: map,
		emissiveIntensity: backed ? 0.7 : 0.55,
		roughness: 0.18,
		transparent: !backed,
		side: backed ? THREE.FrontSide : THREE.DoubleSide,
		depthWrite: backed
	});
}
