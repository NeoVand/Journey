import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { hash } from '../kit/math';

/** The clock the board's light runs on: the cluster sets it every frame. */
export const boardClock = { value: 0 };

interface Trace {
	points: [number, number][];
	width: number;
	warm: boolean;
}

/** The traces, routed at 45 degrees like a real board, and tiled so nobody sees the seam. */
function routeTraces(S: number) {
	const routes: Trace[] = [];
	for (let i = 0; i < 34; i++) {
		const y = (i + 0.5) * (S / 34);
		const bend = 200 + hash(i) * 500;
		const run = 30 + hash(i + 40) * 60;
		const up = hash(i + 80) > 0.5 ? 1 : -1;
		routes.push({
			points: [
				[0, y],
				[bend, y],
				[bend + run, y + up * run],
				[S, y + up * run]
			],
			width: hash(i + 7) > 0.8 ? 4 : 2,
			warm: hash(i + 120) > 0.3
		});
	}
	return routes;
}

/** The board's print: dim traces and pads on navy. */
function traces(routes: Trace[], S: number) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = S;
	const c = canvas.getContext('2d')!;
	c.fillStyle = '#0f2149';
	c.fillRect(0, 0, S, S);
	c.lineCap = 'round';
	c.lineJoin = 'round';
	routes.forEach((r, i) => {
		c.strokeStyle = r.warm ? 'rgba(244,195,90,.09)' : 'rgba(127,196,255,.08)';
		c.lineWidth = r.width;
		c.beginPath();
		r.points.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
		c.stroke();
		const [ex, ey] = r.points[2];
		c.fillStyle = 'rgba(244,195,90,.12)';
		c.beginPath();
		c.arc(ex + 60 + hash(i + 9) * 100, ey, 4.5, 0, Math.PI * 2);
		c.fill();
	});
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

/** Where light can run: the traces alone, white on black. */
function glowMask(routes: Trace[], S: number) {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = S;
	const c = canvas.getContext('2d')!;
	c.fillStyle = '#000';
	c.fillRect(0, 0, S, S);
	c.lineCap = 'round';
	c.lineJoin = 'round';
	c.strokeStyle = '#fff';
	for (const r of routes) {
		c.lineWidth = r.width;
		c.beginPath();
		r.points.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y)));
		c.stroke();
	}
	const t = new THREE.CanvasTexture(canvas);
	t.wrapS = t.wrapT = THREE.RepeatWrapping;
	t.anisotropy = 8;
	return t;
}

/** The floor of the machine's interior. Top surface sits at y = 0. */
export function createBoard(x0: number, x1: number, z0: number, z1: number) {
	const group = new THREE.Group();
	const w = x1 - x0;
	const d = z1 - z0;
	const cx = (x0 + x1) / 2;
	const cz = (z0 + z1) / 2;
	// The rim is the board's own dark edge, with a thin line of light along its top. Bright blue, it shouted.
	const rim = new THREE.MeshPhysicalMaterial({ color: '#0c1c42', roughness: 0.35, metalness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.25 });
	const b = new Batch();
	b.add(extrude(roundedRect(w, d, 0.6), 0.7, 0.14, 5, 10), rim, { p: [cx, -0.38, cz], r: [-Math.PI / 2, 0, 0] });
	group.add(b.build('board-rim'));
	const line = new THREE.Mesh(
		new THREE.BoxGeometry(w - 1.2, 0.035, 0.035),
		new THREE.MeshBasicMaterial({ color: new THREE.Color('#4f8dff').multiplyScalar(1.4) })
	);
	line.position.set(cx, -0.012, z1 - 0.07);
	group.add(line);

	const S = 1024;
	const routes = routeTraces(S);
	const map = traces(routes, S);
	map.repeat.set(w / 22, d / 22);
	const flow = glowMask(routes, S);
	flow.repeat.copy(map.repeat);
	const material = new THREE.MeshStandardMaterial({ map, roughness: 0.62, metalness: 0.25, emissive: '#ffffff', emissiveMap: flow });
	material.onBeforeCompile = (shader) => {
		shader.uniforms.uClock = boardClock;
		shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uClock;').replace(
			'#include <emissivemap_fragment>',
			/* glsl */ `
			// Data runs along the traces, left to right: each row of the print has its own pace, start and colour, and only
			// now and then carries anything. Worked out from where the pixel is, so it stays smooth however far away.
			float mask = texture2D(emissiveMap, vEmissiveMapUv).r;
			vec2 uv = vEmissiveMapUv;
			float row = floor(fract(uv.y) * 34.0) + floor(uv.y) * 34.0;
			float h = fract(sin(row * 12.9898) * 43758.5453);
			float h2 = fract(sin(row * 78.233) * 12543.123);
			float pos = fract(uv.x * 0.6 - uClock * (0.05 + 0.08 * h) + h2 * 7.0);
			float pulse = smoothstep(0.78, 0.97, pos) * (1.0 - smoothstep(0.97, 1.0, pos));
			vec3 tint = h2 > 0.4 ? vec3(1.0, 0.7, 0.26) : vec3(0.4, 0.7, 1.0);
			totalEmissiveRadiance = tint * mask * (0.02 + pulse * pulse * 1.8);`
		);
	};
	const top = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.5, d - 0.5), material);
	top.rotation.x = -Math.PI / 2;
	top.position.set(cx, -0.012, cz);
	top.receiveShadow = true;
	group.add(top);
	return group;
}

/**
 * The front of one rack: a server in every row, each with six drive bays and a vent, lit a little from below so the
 * aisle reads as tall and the tops sink into the dark. Rows line up with the status lights in front of them.
 */
function rackFace(rows: number, rowPitch: number, height: number, bottom: number) {
	const W = 128;
	const H = 1024;
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const c = canvas.getContext('2d')!;
	const v = (y: number) => H - ((y - bottom) / height) * H;
	c.fillStyle = '#0b1838';
	c.fillRect(0, 0, W, H);
	const unit = (rowPitch / height) * H;
	for (let r = 0; r < rows; r++) {
		const mid = v(-6.4 + r * rowPitch);
		const top = mid - unit * 0.42;
		c.fillStyle = '#132a5a';
		c.fillRect(4, top, W - 8, unit * 0.84);
		// Six bays, lights in the middle of each.
		for (let k = 0; k < 6; k++) {
			const x = W / 2 + (-1.8 + k * 0.72) * (W / 4.6);
			c.fillStyle = '#0d1f47';
			c.fillRect(x - 8, top + 3, 16, unit * 0.84 - 6);
			c.fillStyle = '#1b3870';
			c.fillRect(x - 8, top + 3, 16, 2);
		}
		// A seam between servers.
		c.fillStyle = '#060f26';
		c.fillRect(0, top + unit * 0.84, W, unit * 0.16);
	}
	// Light pools at the bottom of the aisle and fades upward into the dark.
	const fade = c.createLinearGradient(0, 0, 0, H);
	fade.addColorStop(0, 'rgba(4,10,28,0.85)');
	fade.addColorStop(0.55, 'rgba(4,10,28,0.25)');
	fade.addColorStop(1, 'rgba(60,110,220,0.12)');
	c.fillStyle = fade;
	c.fillRect(0, 0, W, H);
	const t = new THREE.CanvasTexture(canvas);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

/** Aisles of other racks in the dark, because this machine is one of very many. */
export function createRacks(x0: number, x1: number, z: number) {
	const group = new THREE.Group();
	const pitch = 5.2;
	const n = Math.ceil((x1 - x0) / pitch);
	const rack = new THREE.InstancedMesh(rbox(4.6, 26, 3, 0.1, 2), new THREE.MeshStandardMaterial({ color: '#14264f', roughness: 0.7, metalness: 0.2 }), n);
	const face = new THREE.InstancedMesh(
		new THREE.PlaneGeometry(4.4, 26),
		new THREE.MeshStandardMaterial({ map: rackFace(26, 0.92, 26, -7), roughness: 0.55, metalness: 0.3 }),
		n
	);
	const dummy = new THREE.Object3D();
	const pos: number[] = [];
	const col: number[] = [];
	const phase: number[] = [];
	const palette = [new THREE.Color('#41e58a'), new THREE.Color('#ffc247'), new THREE.Color('#7fc4ff')];
	for (let i = 0; i < n; i++) {
		const x = x0 + i * pitch;
		dummy.position.set(x, 6, z);
		dummy.updateMatrix();
		rack.setMatrixAt(i, dummy.matrix);
		dummy.position.set(x, 6, z + 1.52);
		dummy.updateMatrix();
		face.setMatrixAt(i, dummy.matrix);
		for (let r = 0; r < 26; r++) {
			for (let k = 0; k < 6; k++) {
				const seed = i * 100 + r * 10 + k;
				if (hash(seed) < 0.62) continue;
				pos.push(x - 1.8 + k * 0.72, -6.4 + r * 0.92, z + 1.56);
				const c = palette[hash(seed + 3) < 0.7 ? 0 : hash(seed + 5) < 0.6 ? 2 : 1];
				const dim = 0.9 + hash(seed + 8) * 1.4;
				col.push(c.r * dim, c.g * dim, c.b * dim);
				phase.push(hash(seed + 11));
			}
		}
	}
	group.add(rack, face);

	const dot = document.createElement('canvas');
	dot.width = dot.height = 32;
	const c = dot.getContext('2d')!;
	const g = c.createRadialGradient(16, 16, 1, 16, 16, 15);
	g.addColorStop(0, '#fff');
	g.addColorStop(0.45, 'rgba(255,255,255,.7)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	c.fillStyle = g;
	c.fillRect(0, 0, 32, 32);
	const geo = new THREE.BufferGeometry();
	geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
	geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
	geo.setAttribute('phase', new THREE.Float32BufferAttribute(phase, 1));
	const lights = new THREE.PointsMaterial({
		size: 0.62,
		map: new THREE.CanvasTexture(dot),
		vertexColors: true,
		transparent: true,
		depthWrite: false,
		blending: THREE.AdditiveBlending
	});
	// Most lights breathe slowly; one in four is a disk or a link, flickering with traffic.
	lights.onBeforeCompile = (shader) => {
		shader.uniforms.uClock = boardClock;
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nattribute float phase;\nuniform float uClock;\nvarying float vBlink;')
			.replace(
				'#include <color_vertex>',
				`#include <color_vertex>
				float slow = 0.6 + 0.4 * sin(uClock * (0.6 + phase * 1.4) + phase * 40.0);
				float busy = step(0.45, fract(uClock * (2.0 + phase * 6.0) + phase * 17.0)) * step(0.5, fract(uClock * 0.21 + phase * 5.0));
				vBlink = phase > 0.75 ? 0.25 + busy * 0.9 : slow;`
			);
		shader.fragmentShader = shader.fragmentShader
			.replace('#include <common>', '#include <common>\nvarying float vBlink;')
			.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.rgb *= vBlink;');
	};
	group.add(new THREE.Points(geo, lights));
	return group;
}

/** The raised white slab each machine stands on: the same porcelain as the islands in the sky. */
export function createPad(w: number, d: number, h = 0.3) {
	const m = mats();
	const b = new Batch();
	b.add(extrude(roundedRect(w, d, 0.7), h, 0.11, 5, 12), m.porcelain, { p: [0, -h / 2, 0], r: [-Math.PI / 2, 0, 0] });
	const pad = b.build('pad');
	return pad;
}
