import * as THREE from 'three';

/** The palette: every prop in the journey draws from this one set of finishes. */
export const color = {
	cream: '#f6dfb6',
	creamLight: '#fff3da',
	creamDeep: '#d9bf95',
	porcelain: '#f3f6fb',
	steel: '#b8bcc4',
	steelWarm: '#c9c1b2',
	slate: '#28405f',
	recess: '#16243d',
	cobalt: '#1f5fe0',
	sky: '#7fc4ff',
	amber: '#ffbc12',
	orange: '#ff7f17',
	green: '#22d36b',
	red: '#f0473c',
	ink: '#111a2e',
	paper: '#fbfaf5'
};

function physical(params: THREE.MeshPhysicalMaterialParameters) {
	return new THREE.MeshPhysicalMaterial(params);
}

let cache: ReturnType<typeof create> | undefined;

function create() {
	return {
		cream: physical({ color: color.cream, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.35 }),
		creamLight: physical({ color: color.creamLight, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 }),
		creamDeep: physical({ color: color.creamDeep, roughness: 0.5, clearcoat: 0.3, clearcoatRoughness: 0.4 }),
		porcelain: physical({ color: color.porcelain, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
		steel: new THREE.MeshStandardMaterial({ color: '#e4e8ee', metalness: 0.72, roughness: 0.3 }),
		steelSoft: new THREE.MeshStandardMaterial({ color: '#d9dde4', metalness: 0.5, roughness: 0.44 }),
		enamelCool: physical({ color: '#dfe5ee', roughness: 0.34, metalness: 0.25, clearcoat: 0.7, clearcoatRoughness: 0.25 }),
		gold: new THREE.MeshStandardMaterial({ color: '#f4c35a', metalness: 0.85, roughness: 0.32 }),
		hbm: physical({ color: '#1fc873', roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.2, emissive: '#0b8a48', emissiveIntensity: 0.45 }),
		red: new THREE.MeshStandardMaterial({ color: color.red, roughness: 0.42 }),
		slate: new THREE.MeshStandardMaterial({ color: color.slate, roughness: 0.55, metalness: 0.2 }),
		recess: new THREE.MeshStandardMaterial({ color: color.recess, roughness: 0.75 }),
		rubber: new THREE.MeshStandardMaterial({ color: '#2b3448', roughness: 0.85 }),
		cobalt: physical({ color: color.cobalt, roughness: 0.28, metalness: 0.1, clearcoat: 0.9, clearcoatRoughness: 0.15 }),
		paper: new THREE.MeshStandardMaterial({ color: color.paper, roughness: 0.82, side: THREE.DoubleSide }),
		amber: physical({
			color: color.amber,
			roughness: 0.26,
			clearcoat: 1,
			clearcoatRoughness: 0.12,
			emissive: '#ff9600',
			emissiveIntensity: 0.4
		}),
		orangeGlow: physical({
			color: '#ff8a1e',
			roughness: 0.2,
			clearcoat: 1,
			clearcoatRoughness: 0.1,
			emissive: '#ff5a00',
			emissiveIntensity: 0.42
		}),
		greenGlow: physical({
			color: '#3fe583',
			roughness: 0.24,
			clearcoat: 1,
			clearcoatRoughness: 0.1,
			emissive: '#10c25a',
			emissiveIntensity: 0.55
		})
	};
}

export function mats() {
	return (cache ??= create());
}

/** Small emissive lamp. Each has its own material because each changes state independently. */
export class Lamp {
	mesh: THREE.Mesh;
	material: THREE.MeshStandardMaterial;
	private c = new THREE.Color();

	constructor(geo: THREE.BufferGeometry, hex: string, intensity = 1.6) {
		this.material = new THREE.MeshStandardMaterial({
			color: '#20242c',
			roughness: 0.3,
			emissive: hex,
			emissiveIntensity: intensity
		});
		this.mesh = new THREE.Mesh(geo, this.material);
	}

	set(hex: string, intensity: number) {
		this.c.set(hex);
		this.material.emissive.copy(this.c);
		this.material.emissiveIntensity = intensity * 3;
	}

	/** Lerp towards a colour, used when a lamp changes state on scroll. */
	mix(a: string, b: string, t: number, intensity: number) {
		this.material.emissive.set(a).lerp(this.c.set(b), t);
		this.material.emissiveIntensity = intensity * 3;
	}
}
