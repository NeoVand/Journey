import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { CopyShader } from 'three/addons/shaders/CopyShader.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOShader } from 'three/addons/shaders/GTAOShader.js';
import { isPhone, setMaxAnisotropy, Surface } from './kit/print';

/**
 * Only the scene's edges need antialiasing. The composer would make every later full-screen pass draw into a
 * multisampled buffer too, which on a retina screen cost more than everything else put together.
 */
class SceneMsaaPass extends Pass {
	/** Off while the occlusion pass is on: that pass reads the frame straight from here, which saves copying every pixel. */
	copies = true;
	target: THREE.WebGLRenderTarget;
	private copy = new THREE.ShaderMaterial({ ...CopyShader, uniforms: THREE.UniformsUtils.clone(CopyShader.uniforms), depthTest: false, depthWrite: false });
	private quad = new FullScreenQuad(this.copy);

	constructor(
		private scene: THREE.Scene,
		private camera: THREE.Camera,
		samples: number
	) {
		super();
		this.needsSwap = false;
		// The resolved depth lets the occlusion, worked out at half resolution, land on the right side of every edge.
		this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, samples, depthTexture: new THREE.DepthTexture(4, 4) });
	}

	setSize(width: number, height: number) {
		this.target.setSize(width, height);
	}

	render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, read: THREE.WebGLRenderTarget) {
		renderer.setRenderTarget(this.target);
		renderer.render(this.scene, this.camera);
		if (!this.copies) return;
		this.copy.uniforms.tDiffuse.value = this.target.texture;
		renderer.setRenderTarget(read);
		this.quad.render(renderer);
	}

	dispose() {
		this.target.depthTexture?.dispose();
		this.target.dispose();
		this.copy.dispose();
		this.quad.dispose();
	}
}

/**
 * Sixteen rotations and step lengths, one per pixel of a 4×4 tile, in Bayer order so neighbours differ as much as possible.
 * The occlusion shader casts three slices 60° apart, so rotations across 60° cover every direction. The filter after it
 * averages exactly one tile around each pixel, so every pixel ends up with all sixteen and no grain is left to crawl.
 */
function interleavedNoise() {
	const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
	const data = new Uint8Array(16 * 4);
	for (let i = 0; i < 16; i++) {
		const angle = ((bayer[i] + 0.5) / 16) * (Math.PI / 3);
		data[i * 4] = Math.round((Math.cos(angle) * 0.5 + 0.5) * 255);
		data[i * 4 + 1] = Math.round((Math.sin(angle) * 0.5 + 0.5) * 255);
		data[i * 4 + 2] = 128;
		// The step length follows the transposed pattern, so it is not tied to the rotation.
		data[i * 4 + 3] = Math.round(((bayer[(i % 4) * 4 + Math.floor(i / 4)] + 0.5) / 16) * 255);
	}
	const texture = new THREE.DataTexture(data, 4, 4);
	texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
	texture.needsUpdate = true;
	return texture;
}

const fullScreenVertex = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

/**
 * Ambient occlusion at half resolution, made to hold still. Three's GTAO pass, run on a fraction of a megapixel, leaves
 * grain several screen pixels wide from its noise and its randomly rotated blur, and the grain swims as the camera moves.
 * Its depth pass also ignores clipping, so parts hidden inside a machine still darken what is around them. This one keeps
 * three's occlusion shader and replaces everything around it.
 */
class Occlusion extends Pass {
	private normals: THREE.WebGLRenderTarget;
	private raw: THREE.WebGLRenderTarget;
	private smooth: THREE.WebGLRenderTarget;
	private gtao: THREE.ShaderMaterial;
	private filter: THREE.ShaderMaterial;
	private blend: THREE.ShaderMaterial;
	private quad = new FullScreenQuad();
	private solid = new Map<string, THREE.MeshNormalMaterial>();
	private planeIds = new Map<THREE.Plane, number>();
	private chosen = new WeakMap<THREE.Material, { n: THREE.MeshNormalMaterial; planes: THREE.Plane[] | null; side: THREE.Side; inter: boolean }>();
	private skip = new THREE.MeshBasicMaterial({ visible: false });
	private swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
	private savedClear = new THREE.Color();

	/** frame: the scene pass's own target, read directly for its colour and its full resolution depth. */
	constructor(
		private scene: THREE.Scene,
		private camera: THREE.PerspectiveCamera,
		frame: THREE.WebGLRenderTarget
	) {
		super();
		const depthTexture = new THREE.DepthTexture(4, 4);
		this.normals = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthTexture });
		this.raw = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
		this.smooth = this.raw.clone();

		this.gtao = new THREE.ShaderMaterial({
			defines: { ...GTAOShader.defines, SAMPLES: 8 },
			uniforms: THREE.UniformsUtils.clone(GTAOShader.uniforms),
			vertexShader: GTAOShader.vertexShader,
			fragmentShader: GTAOShader.fragmentShader,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false
		});
		const u = this.gtao.uniforms;
		u.tNormal.value = this.normals.texture;
		u.tDepth.value = depthTexture;
		u.tNoise.value = interleavedNoise();
		// Radius in world units. Thickness is how far in front a surface may be and still count as cover: past that it is a
		// separate object, not a crease, and darkening the wall behind a post only draws a dark outline round the post.
		u.radius.value = 0.42;
		u.distanceExponent.value = 1.4;
		u.thickness.value = 0.45;
		u.distanceFallOff.value = 1;
		u.scale.value = 1.25;

		this.filter = new THREE.ShaderMaterial({
			uniforms: {
				tAO: { value: this.raw.texture },
				tNormal: { value: this.normals.texture },
				tDepth: { value: depthTexture },
				resolution: { value: new THREE.Vector2() },
				cameraProjectionMatrixInverse: { value: new THREE.Matrix4() }
			},
			vertexShader: fullScreenVertex,
			fragmentShader: /* glsl */ `
				uniform sampler2D tAO;
				uniform sampler2D tNormal;
				uniform highp sampler2D tDepth;
				uniform vec2 resolution;
				uniform mat4 cameraProjectionMatrixInverse;
				varying vec2 vUv;
				#include <packing>
				vec3 viewAt(ivec2 p, float depth) {
					vec4 v = cameraProjectionMatrixInverse * vec4(vec3((vec2(p) + 0.5) / resolution, depth) * 2.0 - 1.0, 1.0);
					return v.xyz / v.w;
				}
				// One whole noise tile around each pixel, skipping what lies off this surface or faces another way.
				void main() {
					ivec2 p = ivec2(gl_FragCoord.xy);
					float d0 = texelFetch(tDepth, p, 0).r;
					if (d0 >= 1.0) { gl_FragColor = vec4(1.0); return; }
					vec3 n0 = unpackRGBToNormal(texelFetch(tNormal, p, 0).rgb);
					vec3 v0 = viewAt(p, d0);
					float tolerance = 0.012 * -v0.z;
					ivec2 last = ivec2(resolution) - 1;
					float sum = 0.0;
					float total = 0.0;
					for (int y = -2; y < 2; y++) {
						for (int x = -2; x < 2; x++) {
							ivec2 q = clamp(p + ivec2(x, y), ivec2(0), last);
							float d = texelFetch(tDepth, q, 0).r;
							vec3 n = unpackRGBToNormal(texelFetch(tNormal, q, 0).rgb);
							float plane = abs(dot(viewAt(q, d) - v0, n0));
							float w = step(d, 0.999999) * max(0.0, 1.0 - plane / tolerance) * pow(max(dot(n, n0), 0.0), 4.0);
							sum += texelFetch(tAO, q, 0).r * w;
							total += w;
						}
					}
					gl_FragColor = vec4(vec3(total > 0.0 ? sum / total : texelFetch(tAO, p, 0).r), 1.0);
				}`,
			blending: THREE.NoBlending,
			depthTest: false,
			depthWrite: false
		});

		this.blend = new THREE.ShaderMaterial({
			uniforms: {
				tDiffuse: { value: frame.texture },
				tFrameDepth: { value: frame.depthTexture },
				tAO: { value: this.smooth.texture },
				tDepth: { value: depthTexture },
				aoSize: { value: new THREE.Vector2() },
				frameTexel: { value: new THREE.Vector2() },
				texelSpan: { value: 1 },
				cameraProjectionMatrixInverse: { value: new THREE.Matrix4() }
			},
			vertexShader: fullScreenVertex,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse;
				uniform highp sampler2D tFrameDepth;
				uniform sampler2D tAO;
				uniform highp sampler2D tDepth;
				uniform vec2 aoSize;
				uniform vec2 frameTexel;
				/** An occlusion texel's height in world units, per unit of distance from the camera. */
				uniform float texelSpan;
				uniform mat4 cameraProjectionMatrixInverse;
				varying vec2 vUv;
				vec3 viewAt(vec2 uv) {
					vec4 v = cameraProjectionMatrixInverse * vec4(vec3(uv, texture2D(tFrameDepth, uv).r) * 2.0 - 1.0, 1.0);
					return v.xyz / v.w;
				}
				// Each pixel takes the occlusion of the four nearest half-resolution texels, but mostly of those on its own surface.
				// Plain interpolation lets a dark crease on one side of an edge spill a pixel or two onto the other, in steps, and
				// gives whatever the occlusion pass leaves out, such as a sheet flagged transparent, the occlusion of what lies behind it.
				void main() {
					vec4 c = texture2D(tDiffuse, vUv);
					if (texture2D(tFrameDepth, vUv).r >= 1.0) { gl_FragColor = c; return; }
					// The surface's own normal, from whichever neighbour on each axis lies on the same surface.
					vec3 v = viewAt(vUv);
					vec3 l = viewAt(vUv - vec2(frameTexel.x, 0.0));
					vec3 r = viewAt(vUv + vec2(frameTexel.x, 0.0));
					vec3 b = viewAt(vUv - vec2(0.0, frameTexel.y));
					vec3 t = viewAt(vUv + vec2(0.0, frameTexel.y));
					vec3 dx = abs(l.z - v.z) < abs(r.z - v.z) ? v - l : r - v;
					vec3 dy = abs(b.z - v.z) < abs(t.z - v.z) ? v - b : t - v;
					vec3 n = normalize(cross(dx, dy));
					// The filter's even tile is centred on a texel corner, so texel i holds the value at corner i.
					vec2 at = vUv * aoSize;
					vec2 f = fract(at);
					ivec2 base = ivec2(floor(at));
					ivec2 last = ivec2(aoSize) - 1;
					// How far a texel's point may sit off this pixel's surface and still be on it: a couple of texels' width
					// out there. Soft, so a crease, where both sides share the shadow, blends instead of breaking into steps.
					float tolerance = 2.0 * texelSpan * -v.z;
					float sum = 0.0;
					float total = 0.0;
					for (int i = 0; i < 4; i++) {
						ivec2 o = ivec2(i & 1, i >> 1);
						ivec2 q = clamp(base + o, ivec2(0), last);
						float bilinear = (o.x == 1 ? f.x : 1.0 - f.x) * (o.y == 1 ? f.y : 1.0 - f.y);
						float dq = texelFetch(tDepth, q, 0).r;
						vec4 vq = cameraProjectionMatrixInverse * vec4(vec3((vec2(q) + 0.5) / aoSize, dq) * 2.0 - 1.0, 1.0);
						float plane = abs(dot(vq.xyz / vq.w - v, n)) / tolerance;
						float w = bilinear * step(dq, 0.999999) / (1.0 + plane * plane);
						sum += texelFetch(tAO, q, 0).r * w;
						total += w;
					}
					// Little or nothing of this surface was seen by the occlusion pass, which leaves some things out on purpose,
					// a sheet flagged transparent for one: such a pixel stays open rather than borrowing what lies behind it.
					float ao = mix(1.0, sum / max(total, 1e-4), smoothstep(0.04, 0.25, total));
					gl_FragColor = vec4(c.rgb * ao, c.a);
				}`,
			depthTest: false,
			depthWrite: false
		});
	}

	/** Half resolution in each direction, so one occlusion texel is one CSS pixel on a retina screen; capped for very large screens. */
	setSize(width: number, height: number) {
		let k = 0.5;
		const cap = 1.6e6;
		if (width * height * k * k > cap) k = Math.sqrt(cap / (width * height));
		const w = Math.max(1, Math.round(width * k));
		const h = Math.max(1, Math.round(height * k));
		this.normals.setSize(w, h);
		this.raw.setSize(w, h);
		this.smooth.setSize(w, h);
		this.gtao.uniforms.resolution.value.set(w, h);
		this.filter.uniforms.resolution.value.set(w, h);
		this.blend.uniforms.aoSize.value.set(w, h);
		this.blend.uniforms.frameTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
	}

	/**
	 * A solid material's stand-in for the normal pass keeps its clipping and sidedness, so the pass sees exactly what the
	 * frame shows. Stand-ins are shared by everything clipped alike, which keeps the pass to a handful of materials.
	 */
	private standIn(material: THREE.Material) {
		if (material.transparent || !material.depthTest || !material.visible) return this.skip;
		const known = this.chosen.get(material);
		if (known && known.planes === material.clippingPlanes && known.side === material.side && known.inter === material.clipIntersection) return known.n;
		const planes = material.clippingPlanes ?? [];
		let key = `${material.side}${material.clipIntersection ? 'i' : ''}`;
		for (const plane of planes) {
			let id = this.planeIds.get(plane);
			if (id === undefined) this.planeIds.set(plane, (id = this.planeIds.size + 1));
			key += `,${id}`;
		}
		let n = this.solid.get(key);
		if (!n) {
			n = new THREE.MeshNormalMaterial({ blending: THREE.NoBlending, side: material.side });
			n.clippingPlanes = material.clippingPlanes;
			n.clipIntersection = material.clipIntersection;
			this.solid.set(key, n);
		}
		this.chosen.set(material, { n, planes: material.clippingPlanes, side: material.side, inter: material.clipIntersection });
		return n;
	}

	/** Normals and depth of the solid things only: labels, glass, decals, sprites, lines and the sky stay out of it. */
	private drawNormals(renderer: THREE.WebGLRenderer) {
		this.scene.traverseVisible((o) => {
			const m = o as THREE.Mesh;
			if (!m.material) return;
			const point = (o as THREE.Points).isPoints || (o as THREE.Line).isLine || (o as THREE.Sprite).isSprite;
			this.swapped.push([m, m.material]);
			m.material = point ? this.skip : Array.isArray(m.material) ? m.material.map((x) => this.standIn(x)) : this.standIn(m.material);
		});
		const background = this.scene.background;
		const shadows = renderer.shadowMap.autoUpdate;
		// The shadow map was drawn for this frame already; drawing the scene again must not draw and blur it a second time.
		renderer.shadowMap.autoUpdate = false;
		this.scene.background = null;
		renderer.setRenderTarget(this.normals);
		renderer.setClearColor(0x7777ff, 1);
		renderer.clear();
		renderer.render(this.scene, this.camera);
		renderer.shadowMap.autoUpdate = shadows;
		this.scene.background = background;
		for (const [o, material] of this.swapped) o.material = material;
		this.swapped.length = 0;
	}

	render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget) {
		const autoClear = renderer.autoClear;
		const clearAlpha = renderer.getClearAlpha();
		renderer.getClearColor(this.savedClear);
		renderer.autoClear = false;
		this.drawNormals(renderer);

		const u = this.gtao.uniforms;
		u.cameraNear.value = this.camera.near;
		u.cameraFar.value = this.camera.far;
		u.cameraProjectionMatrix.value.copy(this.camera.projectionMatrix);
		u.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
		this.filter.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
		this.blend.uniforms.cameraProjectionMatrixInverse.value.copy(this.camera.projectionMatrixInverse);
		this.blend.uniforms.texelSpan.value = (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / this.camera.zoom / this.blend.uniforms.aoSize.value.y;

		// The sky never reaches the occlusion shader, so whatever it skips must read as fully open.
		renderer.setRenderTarget(this.raw);
		renderer.setClearColor(0xffffff, 1);
		renderer.clear();
		this.quad.material = this.gtao;
		this.quad.render(renderer);

		renderer.setRenderTarget(this.smooth);
		this.quad.material = this.filter;
		this.quad.render(renderer);

		renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
		this.quad.material = this.blend;
		this.quad.render(renderer);

		renderer.setClearColor(this.savedClear, clearAlpha);
		renderer.autoClear = autoClear;
	}

	dispose() {
		this.normals.depthTexture?.dispose();
		this.normals.dispose();
		this.raw.dispose();
		this.smooth.dispose();
		(this.gtao.uniforms.tNoise.value as THREE.Texture).dispose();
		this.gtao.dispose();
		this.filter.dispose();
		this.blend.dispose();
		this.skip.dispose();
		for (const n of this.solid.values()) n.dispose();
		this.quad.dispose();
	}
}

/**
 * Bloom is soft by nature, so a small buffer looks the same at a fraction of the cost. But the glow is only as steady as the
 * pass that picks out what glows. One tap per small texel catches a highlight on one frame and misses it on the next, and a
 * hard threshold switches glare fully on or off, so glints flash all over as the camera moves. So every pixel of the frame
 * goes through a soft threshold into a quarter-size buffer, and each bright texel gathers that with a tent it shares with
 * its neighbours. Two steps, because one that gathered the whole frame for every texel read each pixel many times over.
 */
class SoftBloomPass extends UnrealBloomPass {
	private quarter = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: false });
	private gather = new FullScreenQuad(
		new THREE.ShaderMaterial({
			uniforms: { tDiffuse: { value: null }, sourceTexel: { value: new THREE.Vector2() }, threshold: { value: 1 }, knee: { value: 0.5 } },
			vertexShader: fullScreenVertex,
			fragmentShader: /* glsl */ `
				uniform sampler2D tDiffuse;
				uniform vec2 sourceTexel;
				uniform float threshold;
				uniform float knee;
				varying vec2 vUv;
				vec3 bright(vec2 at) {
					vec3 c = texture2D(tDiffuse, at * sourceTexel).rgb;
					return c * smoothstep(threshold - knee, threshold + knee, luminance(c));
				}
				// Four taps, each on a pixel corner so linear filtering averages four pixels: the whole 4×4 block, once.
				void main() {
					vec2 centre = floor(vUv / sourceTexel + 0.5);
					gl_FragColor = vec4((bright(centre + vec2(-1.0, -1.0)) + bright(centre + vec2(1.0, -1.0)) + bright(centre + vec2(-1.0, 1.0)) + bright(centre + vec2(1.0, 1.0))) * 0.25, 1.0);
				}`,
			depthTest: false,
			depthWrite: false
		})
	);

	constructor(strength: number, radius: number, threshold: number) {
		super(new THREE.Vector2(4, 4), strength, radius, threshold);
		const uniforms = this.highPassUniforms as Record<string, THREE.IUniform>;
		uniforms.tQuarter = { value: this.quarter.texture };
		uniforms.sourceTexel = { value: new THREE.Vector2(1, 1) };
		uniforms.span = { value: 1 };
		this.materialHighPassFilter.dispose();
		this.materialHighPassFilter = new THREE.ShaderMaterial({
			uniforms,
			vertexShader: fullScreenVertex,
			fragmentShader: /* glsl */ `
				uniform sampler2D tQuarter;
				uniform vec2 sourceTexel;
				uniform float span;
				varying vec2 vUv;
				void main() {
					// In quarter-buffer texels. Taps on texel corners, two apart, cover the tent's whole width.
					vec2 centre = vUv / sourceTexel;
					vec2 base = floor(centre);
					int n = int(ceil((span + 1.0) * 0.5));
					vec3 sum = vec3(0.0);
					float total = 0.0;
					for (int y = -n; y < n; y++) {
						for (int x = -n; x < n; x++) {
							vec2 at = base + vec2(float(x), float(y)) * 2.0 + 1.0;
							vec2 tent = max(vec2(0.0), 1.0 - abs(at - centre) / span);
							float w = tent.x * tent.y;
							sum += textureLod(tQuarter, at * sourceTexel, 0.0).rgb * w;
							total += w;
						}
					}
					gl_FragColor = vec4(sum / max(total, 1e-4), 1.0);
				}`
		});
	}

	setSize(width: number, height: number) {
		const k = Math.min(1 / 2, 480 / Math.max(1, width));
		super.setSize(Math.max(1, Math.round(width * k)), Math.max(1, Math.round(height * k)));
		const qw = Math.max(1, Math.round(width / 4));
		const qh = Math.max(1, Math.round(height / 4));
		this.quarter.setSize(qw, qh);
		(this.gather.material as THREE.ShaderMaterial).uniforms.sourceTexel.value.set(1 / Math.max(1, width), 1 / Math.max(1, height));
		// The bright buffer is half of what was asked for; the tent spans one of its texels, in quarter-buffer texels.
		const uniforms = this.highPassUniforms as Record<string, THREE.IUniform>;
		uniforms.sourceTexel.value.set(1 / qw, 1 / qh);
		uniforms.span.value = Math.max(1, qw / this.renderTargetBright.width);
	}

	render(renderer: THREE.WebGLRenderer, writeBuffer: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget, deltaTime: number, maskActive: boolean) {
		const u = (this.gather.material as THREE.ShaderMaterial).uniforms;
		u.tDiffuse.value = readBuffer.texture;
		u.threshold.value = this.threshold;
		renderer.setRenderTarget(this.quarter);
		this.gather.render(renderer);
		super.render(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
	}

	dispose() {
		super.dispose();
		this.quarter.dispose();
		this.gather.material.dispose();
		this.gather.dispose();
	}
}

/**
 * Three's Neutral tone mapping with less of its pull towards white in the highlights. At three's 0.15 a sunlit orange
 * cable comes out salmon and a lit lamp comes out mint. Brightness is compressed exactly the same; only the colour holds.
 */
class ClearOutputPass extends OutputPass {
	constructor() {
		super();
		const neutral = /* glsl */ `
			vec3 ClearNeutralToneMapping(vec3 color) {
				const float StartCompression = 0.8 - 0.04;
				const float Desaturation = 0.05;
				color *= toneMappingExposure;
				float x = min(color.r, min(color.g, color.b));
				color -= x < 0.08 ? x - 6.25 * x * x : 0.04;
				float peak = max(color.r, max(color.g, color.b));
				if (peak < StartCompression) return color;
				float d = 1.0 - StartCompression;
				float newPeak = 1.0 - d * d / (peak + d - StartCompression);
				color *= newPeak / peak;
				float g = 1.0 - 1.0 / (Desaturation * (peak - newPeak) + 1.0);
				return mix(color, vec3(newPeak), g);
			}`;
		this.material.fragmentShader = this.material.fragmentShader
			.replace('#include <colorspace_pars_fragment>', `#include <colorspace_pars_fragment>\n${neutral}`)
			.replace('NeutralToneMapping( gl_FragColor.rgb )', 'ClearNeutralToneMapping( gl_FragColor.rgb )');
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
	ao: Occlusion;
	private frame: SceneMsaaPass;
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
		this.frame = new SceneMsaaPass(this.scene, this.camera, samples);
		this.composer.addPass(this.frame);
		this.ao = new Occlusion(this.scene, this.camera, this.frame.target);
		this.composer.addPass(this.ao);
		this.bloom = new SoftBloomPass(0.2, 0.42, 2.4);
		this.composer.addPass(this.bloom);
		this.composer.addPass(new ClearOutputPass());
		// Phones have plenty of depth from the lighting alone, and much better uses for the time.
		this.setOcclusion(!isPhone);

		// Phones drop the context when backgrounded. Three restores its own state, but the environment was rendered once, into memory that is now gone.
		canvas.addEventListener('webglcontextrestored', () => {
			this.buildEnvironment();
			renderer.shadowMap.needsUpdate = true;
		});
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
		this.frame.copies = !on;
	}

	/** For when nothing big is moving: keep the shadows already drawn, rather than draw and blur them again every frame. */
	holdShadows(hold: boolean) {
		const map = this.renderer.shadowMap;
		if (map.autoUpdate === !hold) return;
		map.autoUpdate = !hold;
		if (hold) map.needsUpdate = true;
	}

	dispose() {
		this.composer.dispose();
		this.renderer.dispose();
	}
}
