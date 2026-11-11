import * as THREE from 'three';

/**
 * The map in the corner is the world itself, seen from far off: a second camera, fixed, that sees the whole loop at
 * once. It draws into a small target now and then, never every frame, and the page shows what it last drew.
 */
export class MiniMap {
	camera = new THREE.PerspectiveCamera(18, 1.6, 50, 600);
	private target: THREE.WebGLRenderTarget | null = null;
	private pixels: Float32Array | Uint8Array = new Float32Array(0);
	private image: ImageData | null = null;
	private float = true;
	private v = new THREE.Vector3();

	/**
	 * centre and half-sizes: what it has to hold, in the world's units. az and el: where it looks from, in degrees, as the
	 * story's own shots say it.
	 */
	constructor(
		private centre: THREE.Vector3,
		private half: { x: number; y: number },
		private az: number,
		private el: number
	) {}

	/** Fits the whole in a picture this many pixels across and high. */
	private aim(width: number, height: number) {
		const cam = this.camera;
		cam.aspect = width / height;
		const tan = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
		const dist = Math.max(this.half.y / tan, this.half.x / (tan * cam.aspect));
		const a = THREE.MathUtils.degToRad(this.az);
		const e = THREE.MathUtils.degToRad(this.el);
		cam.position.set(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(this.centre);
		cam.near = Math.max(1, dist - 150);
		cam.far = dist + 150;
		cam.lookAt(this.centre);
		cam.updateProjectionMatrix();
		cam.updateMatrixWorld();
	}

	/** Where a point of the world falls in the picture, as shares of its width and height from the top left. */
	where(p: THREE.Vector3 | [number, number, number], width: number, height: number) {
		this.aim(width, height);
		const q = Array.isArray(p) ? this.v.set(...p) : this.v.copy(p);
		q.project(this.camera);
		return { x: (q.x + 1) / 2, y: (1 - q.y) / 2 };
	}

	/** Draws the scene as it stands into the canvas. The caller has already shown and hidden what it wants. */
	draw(renderer: THREE.WebGLRenderer, scene: THREE.Scene, canvas: HTMLCanvasElement) {
		const width = canvas.width;
		const height = canvas.height;
		if (!width || !height) return;
		this.aim(width, height);
		if (!this.target || this.target.width !== width || this.target.height !== height) {
			this.target?.dispose();
			// Float, so the dark end doesn't band once it's brought back to the screen's colours here.
			this.float = renderer.extensions.has('EXT_color_buffer_float');
			this.target = new THREE.WebGLRenderTarget(width, height, { type: this.float ? THREE.FloatType : THREE.UnsignedByteType, samples: 0 });
			this.pixels = this.float ? new Float32Array(width * height * 4) : new Uint8Array(width * height * 4);
			this.image = new ImageData(width, height);
		}
		const before = renderer.getRenderTarget();
		const shadows = renderer.shadowMap.autoUpdate;
		renderer.shadowMap.autoUpdate = false;
		renderer.setRenderTarget(this.target);
		renderer.clear();
		renderer.render(scene, this.camera);
		renderer.readRenderTargetPixels(this.target, 0, 0, width, height, this.pixels);
		renderer.setRenderTarget(before);
		renderer.shadowMap.autoUpdate = shadows;
		this.paint(renderer.toneMappingExposure);
		canvas.getContext('2d')?.putImageData(this.image!, 0, 0);
	}

	/**
	 * A render target is drawn in linear light, without the screen's tone mapping. This does what the screen's output
	 * does, the same neutral curve and then sRGB, and turns the picture the right way up.
	 */
	private paint(exposure: number) {
		const { width, height, data } = this.image!;
		const src = this.pixels;
		const scale = this.float ? 1 : 1 / 255;
		const c = [0, 0, 0];
		for (let y = 0; y < height; y++) {
			const from = (height - 1 - y) * width * 4;
			const to = y * width * 4;
			for (let x = 0; x < width; x++) {
				const i = from + x * 4;
				for (let k = 0; k < 3; k++) c[k] = src[i + k] * scale * exposure;
				neutral(c);
				const o = to + x * 4;
				for (let k = 0; k < 3; k++) data[o + k] = srgb(c[k]) * 255;
				data[o + 3] = 255;
			}
		}
	}

	dispose() {
		this.target?.dispose();
	}
}

/** Khronos PBR Neutral, as three's NeutralToneMapping does it. */
function neutral(c: number[]) {
	const start = 0.76;
	const desaturation = 0.15;
	const low = Math.min(c[0], c[1], c[2]);
	const offset = low < 0.08 ? low - 6.25 * low * low : 0.04;
	for (let k = 0; k < 3; k++) c[k] -= offset;
	const peak = Math.max(c[0], c[1], c[2]);
	if (peak < start) return;
	const d = 1 - start;
	const top = 1 - (d * d) / (peak + d - start);
	for (let k = 0; k < 3; k++) c[k] *= top / peak;
	const g = 1 - 1 / (desaturation * (peak - top) + 1);
	for (let k = 0; k < 3; k++) c[k] = c[k] * (1 - g) + top * g;
}

function srgb(v: number) {
	const x = Math.min(1, Math.max(0, v));
	return x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
}
