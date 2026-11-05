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

/** A drawable surface: a canvas with its texture, redrawn when the reader changes something. */
export class Surface {
	canvas: HTMLCanvasElement;
	ctx: CanvasRenderingContext2D;
	texture: THREE.CanvasTexture;

	constructor(
		public w: number,
		public h: number
	) {
		this.canvas = document.createElement('canvas');
		this.canvas.width = w;
		this.canvas.height = h;
		this.ctx = this.canvas.getContext('2d')!;
		this.texture = canvasTexture(this.canvas);
	}

	draw(fn: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
		this.ctx.clearRect(0, 0, this.w, this.h);
		fn(this.ctx, this.w, this.h);
		this.texture.needsUpdate = true;
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
		this.px = Math.max(32, Math.round(height * this.style.density));
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
		surface.canvas.width = surface.w = tw;
		surface.canvas.height = surface.h = th;
		surface.texture.dispose();
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
