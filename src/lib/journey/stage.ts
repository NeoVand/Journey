import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { isPhone, setMaxAnisotropy, Surface } from './kit/print';

/**
 * Only the scene's edges need antialiasing. The composer would make every later full-screen pass draw into a
 * multisampled buffer too, which on a retina screen cost more than everything else put together.
 */
class SceneMsaaPass extends Pass {
	private target: THREE.WebGLRenderTarget;
	private copy = new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false });
	private quad = new FullScreenQuad(this.copy);

	constructor(
		private scene: THREE.Scene,
		private camera: THREE.Camera,
		samples: number
	) {
		super();
		this.needsSwap = false;
		this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples });
	}

	setSize(width: number, height: number) {
		this.target.setSize(width, height);
	}

	render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
		renderer.setRenderTarget(this.target);
		renderer.render(this.scene, this.camera);
		this.copy.uniforms.tDiffuse.value = this.target.texture;
		renderer.setRenderTarget(read);
		this.quad.render(renderer);
	}

	dispose() {
		this.target.dispose();
		this.copy.dispose();
		this.quad.dispose();
	}
}

/** Ambient occlusion only considers solid things: labels, glass, decals and the sky stay out of it. */
class SolidGTAOPass extends GTAOPass {
	_overrideVisibility() {
		const cache = (this as unknown as { _visibilityCache: THREE.Object3D[] })._visibilityCache;
		this.scene.traverse((o) => {
			const material = (o as THREE.Mesh).material as THREE.Material | undefined;
			const hide = (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite || (material && (material.transparent || !material.depthTest));
			if (hide && o.visible) {
				o.visible = false;
				cache.push(o);
			}
		});
	}

	/** Occlusion is low frequency, so it runs on a fraction of a megapixel and is scaled up. */
	setSize(width: number, height: number) {
		const k = Math.min(1, 800 / Math.max(1, width));
		super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
	}
}

/** Bloom is soft by nature, so a small buffer looks the same at a fraction of the cost. */
class SoftBloomPass extends UnrealBloomPass {
	setSize(width: number, height: number) {
		const k = Math.min(1 / 2, 480 / Math.max(1, width));
		super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
	}
}

/** Renderer, studio lighting, sky and post. Knows nothing about what is on the stage. */
export class Stage {
	renderer: THREE.WebGLRenderer;
	scene = new THREE.Scene();
	camera: THREE.PerspectiveCamera;
	sun: THREE.DirectionalLight;
	private fill: THREE.DirectionalLight;
	composer: EffectComposer;
	bloom: UnrealBloomPass;
	ao: GTAOPass;
	private skyCanvas!: HTMLCanvasElement;
	private skyTexture!: THREE.CanvasTexture;
	private skyKey = '';
	width = 1;
	height = 1;
	dpr = 1;

	constructor(public canvas: HTMLCanvasElement) {
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
		renderer.outputColorSpace = THREE.SRGBColorSpace;
		renderer.toneMapping = THREE.NeutralToneMapping;
		renderer.toneMappingExposure = 1.0;
		renderer.shadowMap.enabled = true;
		renderer.shadowMap.type = THREE.VSMShadowMap;
		renderer.localClippingEnabled = true;
		this.renderer = renderer;
		setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());

		this.camera = new THREE.PerspectiveCamera(22, 1, 0.5, 500);
		this.scene.add(this.camera);

		this.buildSky();
		this.buildEnvironment();

		const hemi = new THREE.HemisphereLight('#dbeeff', '#b9a78c', 0.1);
		this.scene.add(hemi);

		this.sun = new THREE.DirectionalLight('#ffeccd', 2.7);
		this.sun.castShadow = true;
		this.sun.shadow.mapSize.setScalar(isPhone ? 1024 : 2048);
		this.sun.shadow.bias = -0.0002;
		this.sun.shadow.normalBias = 0.02;
		this.sun.shadow.radius = 5;
		this.sun.shadow.blurSamples = 8;
		this.scene.add(this.sun, this.sun.target);

		// Cool kicker from behind the camera's right, so flanks separate from the sky.
		const kick = new THREE.DirectionalLight('#bfdcff', 0.5);
		kick.position.set(30, 10, 12);
		this.scene.add(kick);

		// Soft frontal fill: faces turned to the reader stay luminous, paper especially.
		this.fill = new THREE.DirectionalLight('#fff4e6', 0.3);
		this.scene.add(this.fill, this.fill.target);

		// On a retina screen the pixels are already fine, so two samples look the same as four.
		const samples = window.devicePixelRatio >= 1.5 ? 2 : 4;
		this.composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false }));
		this.composer.addPass(new SceneMsaaPass(this.scene, this.camera, samples));
		this.ao = new SolidGTAOPass(this.scene, this.camera, 4, 4);
		this.ao.blendIntensity = 1;
		this.ao.updateGtaoMaterial({ radius: 0.42, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 8, distanceFallOff: 1, screenSpaceRadius: false });
		this.ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 0.6, normalPhi: 1, radius: 9, radiusExponent: 1.5, rings: 3, samples: 16 });
		this.composer.addPass(this.ao);
		this.bloom = new SoftBloomPass(new THREE.Vector2(4, 4), 0.2, 0.42, 2.4);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new OutputPass());
		// Phones have plenty of depth from the lighting alone, and much better uses for the time.
		this.ao.enabled = !isPhone;

		// Phones drop the context when backgrounded. Three restores its own state, but the environment was rendered once, into memory that is now gone.
		canvas.addEventListener('webglcontextrestored', () => this.buildEnvironment());
	}

	/** The sky is a small gradient texture: it never enters depth, normals or occlusion. */
	private buildSky() {
		this.skyCanvas = document.createElement('canvas');
		this.skyCanvas.width = this.skyCanvas.height = 96;
		this.skyTexture = new THREE.CanvasTexture(this.skyCanvas);
		this.skyTexture.colorSpace = THREE.SRGBColorSpace;
		this.skyTexture.minFilter = THREE.LinearFilter;
		this.skyTexture.magFilter = THREE.LinearFilter;
		this.scene.background = this.skyTexture;
	}

	/** A small studio built in code: gradient dome plus softboxes. This is what the enamel reflects. */
	private buildEnvironment() {
		const env = new THREE.Scene();
		const dome = new THREE.Mesh(
			new THREE.SphereGeometry(50, 32, 16),
			new THREE.ShaderMaterial({
				side: THREE.BackSide,
				vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
				fragmentShader: `varying vec3 vP; void main(){ float y = normalize(vP).y;
					vec3 top = vec3(.42,.58,.86); vec3 hor = vec3(.78,.82,.86); vec3 low = vec3(.30,.33,.42);
					vec3 c = y > 0. ? mix(hor, top, pow(y,.6)) : mix(hor, low, pow(-y,.55));
					gl_FragColor = vec4(c*1.05,1.); }`
			})
		);
		env.add(dome);
		const box = (w: number, h: number, intensity: number, hex: string, p: [number, number, number]) => {
			const m = new THREE.Mesh(
				new THREE.PlaneGeometry(w, h),
				new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(intensity), side: THREE.DoubleSide })
			);
			m.position.set(...p);
			m.lookAt(0, 0, 0);
			env.add(m);
		};
		box(26, 14, 16, '#fff3df', [-18, 34, 18]);
		box(6, 36, 12, '#ffffff', [40, 10, 6]);
		box(30, 4, 9, '#e4f2ff', [4, 12, 42]);
		box(10, 16, 5, '#ffdcb4', [-38, 4, -8]);
		box(3, 30, 8, '#ffffff', [18, 8, 38]);
		const pmrem = new THREE.PMREMGenerator(this.renderer);
		const tex = pmrem.fromScene(env, 0.03).texture;
		this.scene.environment = tex;
		this.scene.environmentIntensity = 0.62;
		pmrem.dispose();
	}

	/** Keeps the shadow map's sharpest area on what the reader is looking at. */
	focusLight(target: THREE.Vector3, radius: number) {
		const size = Math.max(9, radius * 1.5);
		const cam = this.sun.shadow.camera;
		if (cam.right !== size) {
			cam.left = -size;
			cam.right = size;
			cam.top = size;
			cam.bottom = -size;
			cam.near = 1;
			cam.far = 140;
			cam.updateProjectionMatrix();
		}
		// Snap to texels so shadows do not crawl while the camera moves.
		const texel = (size * 2) / this.sun.shadow.mapSize.x;
		const x = Math.round(target.x / texel) * texel;
		const y = Math.round(target.y / texel) * texel;
		const z = Math.round(target.z / texel) * texel;
		this.sun.target.position.set(x, y, z);
		this.sun.position.set(x - 13, y + 38, z + 15);
		this.sun.target.updateMatrixWorld();
		this.fill.target.position.set(x, y, z);
		this.fill.position.set(x + 6, y + 8, z + 30);
		this.fill.target.updateMatrixWorld();
	}

	setSky(top: THREE.Color, mid: THREE.Color, low: THREE.Color) {
		const key = top.getHexString() + mid.getHexString() + low.getHexString();
		if (key === this.skyKey) return;
		this.skyKey = key;
		const c = this.skyCanvas.getContext('2d')!;
		const g = c.createLinearGradient(0, 0, 24, 96);
		g.addColorStop(0, `#${top.getHexString(THREE.SRGBColorSpace)}`);
		g.addColorStop(0.5, `#${mid.getHexString(THREE.SRGBColorSpace)}`);
		g.addColorStop(1, `#${low.getHexString(THREE.SRGBColorSpace)}`);
		c.fillStyle = g;
		c.fillRect(0, 0, 96, 96);
		this.skyTexture.needsUpdate = true;
	}

	resize(width: number, height: number, dpr: number) {
		this.width = width;
		this.height = height;
		this.dpr = dpr;
		this.renderer.setPixelRatio(dpr);
		this.renderer.setSize(width, height, false);
		this.composer.setPixelRatio(dpr);
		this.composer.setSize(width, height);
	}

	render() {
		this.composer.render();
	}

	/**
	 * Draws everything the journey will ever show, once, into a tiny frame, behind the loading screen. The first time the GPU
	 * meets a mesh it has to upload it and build a pipeline for it, and that is what used to stall a frame in the middle of a scene.
	 */
	warmUp() {
		const saved: [THREE.Object3D, boolean, boolean][] = [];
		this.scene.traverse((o) => {
			saved.push([o, o.visible, o.frustumCulled]);
			o.visible = true;
			o.frustumCulled = false;
		});
		this.composer.setPixelRatio(1);
		this.composer.setSize(80, 50);
		this.composer.render();
		for (const surface of Surface.all) this.renderer.initTexture(surface.texture);
		const gl = this.renderer.getContext();
		gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // waits for the GPU to finish all of it
		for (const [o, visible, culled] of saved) {
			o.visible = visible;
			o.frustumCulled = culled;
		}
	}

	setOcclusion(on: boolean) {
		this.ao.enabled = on;
	}

	dispose() {
		this.composer.dispose();
		this.renderer.dispose();
	}
}
