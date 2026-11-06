import * as THREE from 'three';

export const font = {
	display: '"Bricolage Grotesque Variable", system-ui, sans-serif',
	sans: '"Instrument Sans Variable", system-ui, sans-serif',
	mono: '"JetBrains Mono Variable", ui-monospace, monospace'
};

export async function loadFonts() {
	if (typeof document === 'undefined' || !document.fonts) return;
	await Promise.all([
		document.fonts.load(`700 40px ${font.display}`),
		document.fonts.load(`500 40px ${font.sans}`),
		document.fonts.load(`500 40px ${font.mono}`),
		document.fonts.load(`700 40px ${font.mono}`)
	]);
}

let maxAniso = 8;
export const setMaxAnisotropy = (a: number) => (maxAniso = a);

export function canvasTexture(canvas: HTMLCanvasElement) {
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = maxAniso;
	t.generateMipmaps = true;
	t.minFilter = THREE.LinearMipmapLinearFilter;
	return t;
}

/** A phone: a small screen and a tight memory budget, so printed surfaces and the frame itself get lighter. */
export const isPhone = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
const PRINT = isPhone ? 0.6 : 1;
/** On a phone no printed surface is wider or taller than this, and no line of text taller than LABEL_MAX: the biggest
 * are seen from far away, and every one is held twice, once to draw and once on the GPU. */
const SURFACE_MAX = isPhone ? 1536 : Infinity;
const LABEL_MAX = isPhone ? 160 : Infinity;

/**
 * A drawable surface: a canvas with its texture, redrawn when the reader changes something. Drawn in logical pixels at
 * any print scale.
 *
 * On a phone the canvas is let go once the GPU has its copy, because every printed thing would otherwise be held twice,
 * and a phone's browser closes a page that holds too much. Drawing again brings the canvas back, and if the GPU loses
 * its copies, `repaintAll` draws each surface again from how it was last drawn.
 */
export class Surface {
	static all: Surface[] = [];
	/** Which surface a texture belongs to: its canvas may have been let go, but its size still counts. */
	static of = new WeakMap<THREE.Texture, Surface>();
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	texture: THREE.CanvasTexture;
	/** Keep the canvas: something else copies from it. */
	keep = false;
	/** How to draw this surface again, as it was last drawn. */
	repaint?: () => void;
	private size: [number, number];
	private released = false;

	constructor(
		public w: number,
		public h: number
	) {
		this.canvas = document.createElement('canvas');
		const k = Math.min(PRINT, SURFACE_MAX / Math.max(w, h));
		this.size = [Math.ceil(w * k), Math.ceil(h * k)];
		[this.canvas.width, this.canvas.height] = this.size;
		this.ctx = this.canvas.getContext('2d')!;
		this.ctx.scale(this.canvas.width / w, this.canvas.height / h);
		this.texture = canvasTexture(this.canvas);
		if (isPhone) this.texture.onUpdate = () => this.release();
		Surface.all.push(this);
		Surface.of.set(this.texture, this);
	}

	/** Lets the canvas go once the GPU has what was drawn on it. */
	private release() {
		if (this.keep || !this.repaint) return;
		this.canvas.width = this.canvas.height = 1;
		this.released = true;
	}

	/** Gives a let-go canvas its size back, ready to draw on. Sizing a canvas resets how it was scaled. */
	reclaim(width = this.size[0], height = this.size[1]) {
		this.size = [width, height];
		if (!this.released && this.canvas.width === width && this.canvas.height === height) return;
		this.canvas.width = width;
		this.canvas.height = height;
		this.released = false;
	}

	draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
		if (this.released) {
			this.reclaim();
			this.ctx.scale(this.canvas.width / this.w, this.canvas.height / this.h);
		}
		this.repaint = () => this.draw(fn);
		this.ctx.clearRect(0, 0, this.w, this.h);
		fn(this.ctx, this.w, this.h);
		this.texture.needsUpdate = true;
	}

	/** How many pixels it prints, whether or not its canvas is held right now. */
	get pixels() {
		return this.size[0] * this.size[1];
	}

	/** After the GPU has lost every texture: draw each surface again, so nothing comes back blank. */
	static repaintAll() {
		for (const s of Surface.all) s.repaint?.();
	}
}

export interface LabelStyle {
	font?: string;
	weight?: number;
	color?: string;
	tracking?: number;
	/** Pixels per world unit: keeps every label equally crisp whatever its size. */
	density?: number;
	align?: 'left' | 'center' | 'right';
}

/**
 * Printed text on a surface. Geometry is sized from the measured text, so `height` is
 * the cap-to-baseline line box in world units and widths are always true to the font.
 */
export class Label {
	mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
	surface: Surface;
	private style: Required<LabelStyle>;
	private px: number;
	worldWidth = 0;

	constructor(
		text: string,
		public height: number,
		style: LabelStyle = {}
	) {
		this.style = {
			font: font.display,
			weight: 700,
			color: '#111a2e',
			tracking: -0.01,
			density: 420,
			align: 'center',
			...style
		};
		this.px = Math.max(32, Math.min(LABEL_MAX, Math.round(height * this.style.density * PRINT)));
		this.surface = new Surface(4, 4);
		const material = new THREE.MeshStandardMaterial({
			map: this.surface.texture,
			transparent: true,
			roughness: 0.55,
			depthWrite: false,
			polygonOffset: true,
			polygonOffsetFactor: -2,
			polygonOffsetUnits: -2
		});
		this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
		this.mesh.renderOrder = 2;
		this.set(text);
	}

	set(text: string) {
		const { px, style, surface } = this;
		const fontStr = `${style.weight} ${px}px ${style.font}`;
		const c = surface.ctx;
		c.font = fontStr;
		c.letterSpacing = `${style.tracking * px}px`;
		const tw = Math.ceil(c.measureText(text).width) + 8;
		const th = Math.ceil(px * 1.3);
		surface.reclaim(tw, th);
		surface.w = tw;
		surface.h = th;
		surface.repaint = () => this.set(text);
		surface.texture.dispose();
		c.clearRect(0, 0, tw, th);
		c.font = fontStr;
		c.letterSpacing = `${style.tracking * px}px`;
		c.textBaseline = 'middle';
		c.fillStyle = style.color;
		c.fillText(text, 4, th * 0.53);
		surface.texture.needsUpdate = true;

		const worldW = (tw / th) * this.height * 1.3;
		this.worldWidth = worldW;
		const shift = style.align === 'left' ? worldW / 2 : style.align === 'right' ? -worldW / 2 : 0;
		this.mesh.geometry.dispose();
		this.mesh.geometry = new THREE.PlaneGeometry(worldW, this.height * 1.3);
		this.mesh.geometry.translate(shift, 0, 0);
		// So tools can tell which words a mesh carries.
		this.mesh.userData.text = text;
	}
}

/** Stroke icons, on a 24 unit grid, drawn with the same weight everywhere. */
const ICONS: Record<string, string[]> = {
	doc: [
		'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z',
		'M14 2v6h6',
		'M16 13H8',
		'M16 17H8',
		'M10 9H8'
	],
	wrench: [
		'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z'
	],
	cube: [
		'M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z',
		'm3.3 7 8.7 5 8.7-5',
		'M12 22V12'
	],
	chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z']
};

export function drawIcon(
	c: CanvasRenderingContext2D,
	name: keyof typeof ICONS | string,
	x: number,
	y: number,
	size: number,
	stroke: string,
	weight = 2
) {
	c.save();
	c.translate(x, y);
	c.scale(size / 24, size / 24);
	c.strokeStyle = stroke;
	c.lineWidth = weight;
	c.lineCap = 'round';
	c.lineJoin = 'round';
	for (const d of ICONS[name]) c.stroke(new Path2D(d));
	c.restore();
}

/** A Hugeicons icon, as the page draws it: a list of SVG elements on a 24 unit grid. */
export type IconData = readonly (readonly [string, { readonly [key: string]: string | number }])[];

/** Draws one of the page's own icons onto a canvas, so a sign in the scene can say what the card beside it says. */
export function drawPageIcon(c: CanvasRenderingContext2D, icon: IconData, x: number, y: number, size: number, stroke: string, weight = 1.6) {
	c.save();
	c.translate(x, y);
	c.scale(size / 24, size / 24);
	c.strokeStyle = stroke;
	c.lineWidth = weight;
	c.lineCap = 'round';
	c.lineJoin = 'round';
	const n = (v: string | number | undefined) => Number(v ?? 0);
	for (const [tag, a] of icon) {
		const p = new Path2D();
		if (tag === 'path') p.addPath(new Path2D(String(a.d)));
		else if (tag === 'circle') p.arc(n(a.cx), n(a.cy), n(a.r), 0, Math.PI * 2);
		else if (tag === 'rect') p.roundRect(n(a.x), n(a.y), n(a.width), n(a.height), n(a.rx));
		else if (tag === 'line') {
			p.moveTo(n(a.x1), n(a.y1));
			p.lineTo(n(a.x2), n(a.y2));
		} else continue;
		if (a.fill && a.fill !== 'none') {
			c.fillStyle = stroke;
			c.fill(p);
		}
		if (a.stroke && a.stroke !== 'none') c.stroke(p);
	}
	c.restore();
}

export function roundRectPath(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
	c.beginPath();
	c.roundRect(x, y, w, h, r);
}

/** Pre-blurred contact shadow: this is what makes objects sit on a surface instead of hovering. */
const contactCache = new Map<string, THREE.CanvasTexture>();
export function contactShadow(w: number, d: number, blur = 0.22, opacity = 0.5, tint = '#0d2a55') {
	const key = `${w.toFixed(2)}x${d.toFixed(2)}x${blur}`;
	let tex = contactCache.get(key);
	const pad = blur * 3;
	if (!tex) {
		const k = 110;
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil((w + pad * 2) * k);
		canvas.height = Math.ceil((d + pad * 2) * k);
		const c = canvas.getContext('2d')!;
		// Opaque black first: alpha maps read the green channel, so a transparent canvas would give hard edges.
		c.fillStyle = '#000';
		c.fillRect(0, 0, canvas.width, canvas.height);
		c.filter = `blur(${blur * k}px)`;
		c.fillStyle = '#fff';
		c.beginPath();
		c.roundRect(pad * k, pad * k, w * k, d * k, 0.12 * k);
		c.fill();
		tex = new THREE.CanvasTexture(canvas);
		contactCache.set(key, tex);
	}
	const material = new THREE.MeshBasicMaterial({
		color: tint,
		alphaMap: tex,
		transparent: true,
		opacity,
		depthWrite: false,
		polygonOffset: true,
		polygonOffsetFactor: -1,
		polygonOffsetUnits: -1
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w + pad * 2, d + pad * 2), material);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = 0.006;
	mesh.renderOrder = 1;
	return mesh;
}
