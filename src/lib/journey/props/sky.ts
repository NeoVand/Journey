import * as THREE from 'three';
import { isPhone } from '../kit/print';
import { Rig, type Shot } from '../rig';

/**
 * The weather the islands float in: a sea of cumulus far below and behind them. Every cloud is a painted card that faces
 * the camera, lit from the sun's side with a cool shadow underneath. They are laid out from the camera's own shots, so
 * every picture in the sky has a few along its bottom edge and clear air above, where the words are. All of them stand
 * well behind the islands, so a cloud never crosses a machine, and they really are far off: they slide past slowly as
 * the camera travels.
 */

/** A seeded random, so the sky is the same on every visit and in every screenshot. */
function seeded(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s + 0x6d2b79f5) >>> 0;
		let t = s;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const W = 512;
const H = 256;

/**
 * One cumulus: a flat base and a heaped top, made of overlapping puffs. Painted in three goes: the shape, then a cool
 * shadow rising from the base and gathering on the side away from the sun, then a warm rim where the sun catches it.
 */
function paintCloud(seed: number, tall: number) {
	const rand = seeded(seed);
	const canvas = document.createElement('canvas');
	// A phone paints them at half the size: they're soft anyway, and its memory is tight.
	const res = isPhone ? 0.5 : 1;
	canvas.width = W * res;
	canvas.height = H * res;
	const c = canvas.getContext('2d')!;
	c.scale(res, res);
	const base = H * 0.78;
	const puffs: [number, number, number][] = [];
	const n = 9 + Math.floor(rand() * 5);
	for (let i = 0; i < n; i++) {
		const u = (i + 0.5) / n;
		const x = W * (0.16 + 0.68 * u) + (rand() - 0.5) * 30;
		// The middle heaps highest; the ends stay low and flat.
		const hump = Math.sin(Math.PI * u) ** 1.4;
		const r = 34 + hump * (46 + tall * 40) + rand() * 18;
		const y = base - r * (0.45 + hump * 0.55 * (0.8 + tall * 0.5)) - rand() * 10;
		puffs.push([x, y, r]);
	}
	// A few small ones on top for a crisp, sunlit crown.
	for (let i = 0; i < 4; i++) {
		const [px, py, pr] = puffs[2 + Math.floor(rand() * (n - 4))];
		puffs.push([px + (rand() - 0.5) * pr, py - pr * (0.5 + rand() * 0.3), pr * (0.42 + rand() * 0.2)]);
	}

	// Fit the heap inside the card with room for the blur, so no edge of the card ever shows.
	const pad = 18;
	const left = Math.min(...puffs.map(([x, , r]) => x - r));
	const right = Math.max(...puffs.map(([x, , r]) => x + r));
	const top = Math.min(...puffs.map(([, y, r]) => y - r));
	const k = Math.min(1, (W - pad * 2) / (right - left), (base - pad) / (base - top));
	const mid = (left + right) / 2;
	for (const p of puffs) {
		p[0] = W / 2 + (p[0] - mid) * k;
		p[1] = base - (base - p[1]) * k;
		p[2] *= k;
	}

	// The shape, soft at the edges, cut flat underneath.
	c.save();
	c.filter = `blur(${7 * res}px)`;
	c.fillStyle = '#fff';
	for (const [x, y, r] of puffs) {
		c.beginPath();
		c.arc(x, y, r, 0, Math.PI * 2);
		c.fill();
	}
	c.restore();
	c.globalCompositeOperation = 'destination-out';
	const cut = c.createLinearGradient(0, base - 6, 0, base + 22);
	cut.addColorStop(0, 'rgba(0,0,0,0)');
	cut.addColorStop(1, 'rgba(0,0,0,1)');
	c.fillStyle = cut;
	c.fillRect(0, base - 6, W, H - base + 6);

	// Shade on top of the shape only.
	c.globalCompositeOperation = 'source-atop';
	const under = c.createLinearGradient(0, base - 120 - tall * 60, 0, base);
	under.addColorStop(0, 'rgba(186,212,246,0)');
	under.addColorStop(0.55, 'rgba(178,206,244,0.38)');
	under.addColorStop(1, 'rgba(160,192,238,0.7)');
	c.fillStyle = under;
	c.fillRect(0, 0, W, H);
	// Each puff turns away from the sun (upper left) on its lower right.
	for (const [x, y, r] of puffs) {
		const g = c.createRadialGradient(x + r * 0.42, y + r * 0.5, r * 0.1, x + r * 0.3, y + r * 0.35, r * 1.05);
		g.addColorStop(0, 'rgba(170,198,240,0.3)');
		g.addColorStop(1, 'rgba(170,198,240,0)');
		c.fillStyle = g;
		c.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
	}
	// And catches it on its upper left.
	for (const [x, y, r] of puffs) {
		const g = c.createRadialGradient(x - r * 0.38, y - r * 0.42, r * 0.05, x - r * 0.3, y - r * 0.3, r * 0.9);
		g.addColorStop(0, 'rgba(255,250,240,0.9)');
		g.addColorStop(1, 'rgba(255,250,240,0)');
		c.fillStyle = g;
		c.fillRect(x - r * 1.5, y - r * 1.5, r * 3, r * 3);
	}

	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}

/** What a cloud looks like in the late sun: peach on top, its blue shade turning lilac. */
const LATE = new THREE.Color('#ffe6d4');

interface Cloud {
	sprite: THREE.Sprite;
	base: THREE.Vector3;
	drift: number;
	opacity: number;
}

let shared: THREE.Texture[] | null = null;

export class Cloudscape {
	group = new THREE.Group();
	private clouds: Cloud[] = [];
	private textures: THREE.Texture[] = [];
	private warmth = 0;

	constructor() {
		this.group.name = 'cloudscape';
		// Every sky shares the same six clouds.
		shared ??= Array.from({ length: 6 }, (_, i) => paintCloud(1000 + i * 77, i / 5));
		this.textures = shared;
	}

	/**
	 * Lays clouds along the bottom of every shot in the sky, skipping any spot a cloud laid for an earlier shot already
	 * covers. sky: which shots look at the sky, by their time.
	 */
	lay(lists: { shots: Shot[]; sky: (T: number) => boolean }[], fov: number) {
		const rand = seeded(7);
		const camera = new THREE.PerspectiveCamera(fov, 1.6, 0.5, 2000);
		const at = new THREE.Vector3();
		const ray = new THREE.Vector3();
		const forward = new THREE.Vector3();
		const seen = new THREE.Vector3();
		// Phones draw fewer: every cloud is a layer of blending over the whole picture.
		const slots = isPhone ? [-0.55, 0.45] : [-0.72, -0.12, 0.5];
		for (const { shots, sky } of lists) {
			const rig = new Rig(camera, shots);
			for (const shot of shots) {
				if (!sky(shot.T) || shot.el > 32) continue;
				rig.update(shot.T, 1600, 1000);
				camera.updateMatrixWorld();
				camera.getWorldDirection(forward);
				const dist = camera.position.distanceTo(rig.focus);
				for (const slot of slots) {
					const sx = slot + (rand() - 0.5) * 0.3;
					const sy = -0.98 + rand() * 0.22;
					// Already a cloud here, from another shot?
					const covered = this.clouds.some((c) => {
						seen.copy(c.base).project(camera);
						const half = c.sprite.scale.x / (2 * Math.tan((fov * Math.PI) / 360) * 1.6 * Math.max(1, c.base.distanceTo(camera.position)));
						return seen.z < 1 && Math.abs(seen.x - sx) < Math.max(0.3, half) && Math.abs(seen.y - sy) < 0.4;
					});
					if (covered) continue;
					ray.set(sx, sy, 0.5).unproject(camera).sub(camera.position).normalize();
					// Well behind the subject, and never nearer than the islands' back edges.
					const depth = dist + 40 + rand() * 60;
					let t = depth / Math.max(0.2, ray.dot(forward));
					at.copy(camera.position).addScaledVector(ray, t);
					if (at.z > -30) {
						t += (at.z + 30 + rand() * 12) / -Math.min(-0.05, ray.z);
						at.copy(camera.position).addScaledVector(ray, t);
					}
					const along = t * ray.dot(forward);
					const frame = 2 * Math.tan((fov * Math.PI) / 360) * 1.6 * along;
					this.add(at, frame * (0.34 + rand() * 0.2), 0.9 - Math.min(0.35, (along - dist) / 300), Math.floor(rand() * 6), rand);
				}
			}
		}
	}

	private add(p: THREE.Vector3, width: number, opacity: number, tex: number, rand: () => number) {
		const material = new THREE.SpriteMaterial({
			map: this.textures[tex % this.textures.length],
			transparent: true,
			opacity,
			depthWrite: false,
			fog: false
		});
		const sprite = new THREE.Sprite(material);
		sprite.center.set(0.5, 0.22);
		sprite.scale.set(width, width * (H / W), 1);
		sprite.position.copy(p);
		sprite.renderOrder = -50;
		this.group.add(sprite);
		this.clouds.push({ sprite, base: p.clone(), drift: 0.15 + rand() * 0.25, opacity });
	}

	/** Late afternoon: the clouds catch the low sun. */
	setWarmth(k: number) {
		if (k === this.warmth) return;
		this.warmth = k;
		const tint = new THREE.Color('#ffffff').lerp(LATE, k);
		// From high enough to see the whole trip, every cloud is in view at once: they thin out, so the sky stays air.
		for (const c of this.clouds) {
			const material = c.sprite.material as THREE.SpriteMaterial;
			material.color.copy(tint);
			material.opacity = c.opacity * (1 - 0.5 * k);
		}
	}

	update(time: number) {
		for (const c of this.clouds) c.sprite.position.x = c.base.x + Math.sin(time * 0.02 * c.drift + c.base.z) * 2.2;
	}
}
