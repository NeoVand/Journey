import * as THREE from 'three';

/*
 * Each place in the world wears its own colours, and the colours mean something: what is yours is warm (honey wood,
 * butter cream, walnut, cheerful little gadgets); the provider's buildings are one family of jewel enamels, each its
 * own (a jade door, a rose hall, a midnight-blue tower, a gold crown); other companies' things are each in their own
 * colours. The aqueduct that joins them is white porcelain, as the sky's islands always were.
 */

const glossy = (color: string, rough = 0.3, coat = 0.8, extra: THREE.MeshPhysicalMaterialParameters = {}) =>
	new THREE.MeshPhysicalMaterial({ color, roughness: rough, clearcoat: coat, clearcoatRoughness: 0.2, ...extra });
const metal = (color: string, rough = 0.28, metalness = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness });
const glow = (color: string, emissive: string, intensity: number) =>
	new THREE.MeshStandardMaterial({ color, emissive, emissiveIntensity: intensity, roughness: 0.35 });

function create() {
	return {
		// the aqueduct and every pier
		porcelain: glossy('#f4f6fa', 0.32, 0.7),
		porcelainShade: glossy('#e3e8f0', 0.4, 0.5),
		// yours
		wood: glossy('#c98b4e', 0.34, 0.85),
		woodEdge: glossy('#a8683a', 0.4, 0.7),
		butter: glossy('#fbe7b8', 0.36, 0.7),
		cream: glossy('#f6ead2', 0.4, 0.6),
		walnut: glossy('#6e4126', 0.38, 0.75),
		mint: glossy('#8fdcb6', 0.3, 0.8),
		coral: glossy('#f3907d', 0.3, 0.8),
		skyBlue: glossy('#86bdf0', 0.3, 0.8),
		screen: glow('#0d2a6b', '#2f74ff', 0.9),
		prompt: glow('#08240f', '#2bd36a', 0.9),
		paper: new THREE.MeshStandardMaterial({ color: '#fbf6e8', roughness: 0.8 }),
		// brass and chrome, everywhere things are fitted
		brass: metal('#e6b350', 0.3, 0.9),
		chrome: metal('#e9edf3', 0.2, 0.9),
		amberWindow: glow('#ffcf6a', '#ffab1f', 1.1),
		// the internet
		mastRed: glossy('#e2463c', 0.32, 0.7),
		mastWhite: glossy('#fbfbfb', 0.32, 0.7),
		beacon: glow('#ff5a4a', '#ff3b2e', 2.2),
		// the provider
		jade: glossy('#1f7a55', 0.26, 0.9),
		jadeDeep: glossy('#14583d', 0.3, 0.9),
		rose: glossy('#ef9f97', 0.36, 0.6),
		terracotta: glossy('#d9765c', 0.42, 0.5),
		ivory: glossy('#fbf3e2', 0.34, 0.7),
		glass: new THREE.MeshPhysicalMaterial({
			color: '#e8f3ff',
			roughness: 0.06,
			metalness: 0,
			transparent: true,
			opacity: 0.22,
			clearcoat: 1,
			side: THREE.DoubleSide,
			depthWrite: false
		}),
		midnight: glossy('#16246b', 0.28, 0.9),
		silver: metal('#cfd6e2', 0.25, 0.85),
		cobalt: glow('#1b3fae', '#2f6dff', 1.25),
		rackGlass: new THREE.MeshPhysicalMaterial({
			color: '#8fb8ff',
			roughness: 0.08,
			transparent: true,
			opacity: 0.32,
			emissive: '#1d4bd8',
			emissiveIntensity: 0.35,
			depthWrite: false
		}),
		gold: metal('#f2c14e', 0.26, 0.95),
		// the foundry
		iron: glossy('#3a3534', 0.5, 0.4),
		copper: metal('#c8784a', 0.3, 0.85),
		furnace: glow('#ff9a3c', '#ff6a00', 2.4),
		// the proving ground
		mintEnamel: glossy('#8fd6b0', 0.32, 0.7),
		white: glossy('#ffffff', 0.3, 0.7),
		violet: glossy('#7552c8', 0.26, 0.9),
		pennant: glossy('#f7b733', 0.4, 0.4),
		// the lanes
		amber: glow('#ffc23a', '#ff9a00', 1.4),
		pearl: new THREE.MeshPhysicalMaterial({ color: '#fdfbf6', roughness: 0.18, clearcoat: 1, sheen: 1, sheenColor: '#ffe8f4', emissive: '#fff3df', emissiveIntensity: 0.25 }),
		laneBed: glossy('#f8f2e6', 0.35, 0.6),
		cable: glow('#ffd77a', '#ffb52e', 1.6)
	};
}

let cache: ReturnType<typeof create> | undefined;
export const palette = () => (cache ??= create());
/** A remote company's own colour, as an enamel. */
export const tinted = (hex: string) => glossy(hex, 0.3, 0.85);

/** Where the world's haze begins and where nothing shows through it any more, and its colour: the low sky's. */
export const HAZE = { top: 1.5, bottom: -15, color: new THREE.Color('#d6e8f8') };

/**
 * A copy of a material that fades into the haze below the world: the lower a point of it stands, the more of the low
 * sky's colour it takes, until under the haze it is only sky. Piers and arches go down into it and never end.
 */
export function hazed<M extends THREE.Material>(base: M): M {
	const m = base.clone();
	m.onBeforeCompile = (shader) => {
		shader.uniforms.uHaze = { value: HAZE.color };
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying float vHazeY;')
			.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvHazeY = (modelMatrix * vec4(transformed, 1.0)).y;');
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nvarying float vHazeY;\nuniform vec3 uHaze;')
			.replace(
				'#include <opaque_fragment>',
				`#include <opaque_fragment>\ngl_FragColor.rgb = mix(gl_FragColor.rgb, uHaze, smoothstep(${HAZE.top.toFixed(2)}, ${HAZE.bottom.toFixed(2)}, vHazeY));`
			);
	};
	m.customProgramCacheKey = () => 'hazed';
	return m;
}
