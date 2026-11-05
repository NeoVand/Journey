import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { paper, rbox } from '../kit/geometry';
import { color, mats } from '../kit/materials';
import { drawIcon, font, Label, Surface } from '../kit/print';
import { PROMPT, type HarnessSpec } from '../content';

export const DOC_W = 2.3;
export const DOC_H = 3.1;
export const STRIP_W = 1.84;
export const STRIP_H = 0.34;

/** Slot centres in document space (origin at the sheet's centre), top to bottom. */
export const SLOT_Y = [0.56, 0.17, -0.42, -1.01];

const ROLL_R = 0.16;
const ROLL_LIFT = 0.1; // the roll rests on the stand, not in it
const ROLL_TIGHTEN = 0.004; // how much the radius shrinks per radian, so the end shows a spiral

const ROLL_ROWS = 150; // enough that three turns of paper still read as round

const ACCENT = ['#1f5fe0', '#1f5fe0', '#1f5fe0', '#d97a00'];
const ICONS = ['doc', 'cube', 'wrench', 'chat'];

/** A slip of paper carrying one drawer's contents to its place in the request. */
export class Strip {
	mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	private surface = new Surface(920, 170);
	get canvas() {
		return this.surface.canvas;
	}

	constructor(private index: number) {
		const material = new THREE.MeshStandardMaterial({
			map: this.surface.texture,
			roughness: 0.7,
			side: THREE.DoubleSide
		});
		this.mesh = new THREE.Mesh(paper(STRIP_W, STRIP_H, 0.01, 0.012), material);
		this.mesh.castShadow = true;
	}

	setHarness(spec: HarnessSpec) {
		const lines = [
			`Harness rules + ${spec.ruleFile}`,
			'cwd, git branch, OS, date, shell',
			spec.tools.join('  '),
			PROMPT
		];
		const i = this.index;
		this.surface.draw((c, w, h) => {
			c.fillStyle = '#fffdf7';
			c.fillRect(0, 0, w, h);
			c.fillStyle = ACCENT[i];
			c.fillRect(0, 0, 16, h);
			drawIcon(c, ICONS[i], 42, h / 2 - 34, 68, ACCENT[i], 2.1);
			const mono = i === 2;
			let size = mono ? 50 : 54;
			c.font = `${mono ? 600 : 600} ${size}px ${mono ? font.mono : font.sans}`;
			const max = w - 150;
			while (c.measureText(lines[i]).width > max && size > 22) {
				size -= 1;
				c.font = `600 ${size}px ${mono ? font.mono : font.sans}`;
			}
			c.fillStyle = color.ink;
			c.textBaseline = 'middle';
			c.fillText(lines[i], 130, h / 2 + 3);
		});
	}
}

/**
 * The request itself: a printed JSON skeleton with four empty slots, which the strips fill.
 * Order on the page is the order on the wire: stable first, the growing conversation last.
 */
export class RequestDoc {
	group = new THREE.Group();
	sheet: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	back: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
	private surface = new Surface(1104, 1488);
	/** The same page with its strips printed in, which is what gets rolled up: strips cannot bend with it. */
	private baked = new Surface(1104, 1488);
	private filled = false;
	tabs = new THREE.Group();
	private tabMats: THREE.Material[] = [];
	private rolled = -1;
	private rest: { pos: Float32Array; nor: Float32Array }[] = [];

	constructor() {
		const m = mats();
		const material = new THREE.MeshStandardMaterial({
			map: this.surface.texture,
			roughness: 0.78,
			side: THREE.DoubleSide
		});
		this.sheet = new THREE.Mesh(paper(DOC_W, DOC_H, 0.18, 0.03, ROLL_ROWS), material);
		this.sheet.castShadow = true;
		this.sheet.receiveShadow = true;
		this.group.add(this.sheet);

		const backMat = (m.paper as THREE.MeshStandardMaterial).clone();
		// Flagged transparent only to stay out of the occlusion pass: the gap to the front sheet is too thin for it.
		backMat.transparent = true;
		this.back = new THREE.Mesh(paper(DOC_W, DOC_H, 0.06, 0.02, ROLL_ROWS), backMat);
		this.back.position.set(0.05, -0.05, -0.05);
		this.back.rotation.z = -0.018;
		this.back.castShadow = true;
		this.group.add(this.back);

		this.buildTabs();
		this.group.add(this.tabs);
		for (const mesh of [this.sheet, this.back]) {
			mesh.frustumCulled = false;
			this.rest.push({
				pos: Float32Array.from(mesh.geometry.attributes.position.array),
				nor: Float32Array.from(mesh.geometry.attributes.normal.array)
			});
		}
		this.setRoll(0);
	}

	/**
	 * 0 is a tight scroll lying on the stand, 1 is a flat page. The sheet unrolls upward: everything below
	 * the roll is flat, everything above it is wrapped around the roll in a spiral, printed side out.
	 */
	setRoll(k: number) {
		if (k === this.rolled) return;
		this.rolled = k;
		this.back.position.set(0.05 * k, -0.05 * k, -0.05 * k);
		this.back.rotation.z = -0.018 * k;
		[this.sheet, this.back].forEach((mesh, n) => {
			const attr = mesh.geometry.attributes.position as THREE.BufferAttribute;
			const normal = mesh.geometry.attributes.normal as THREE.BufferAttribute;
			const { pos, nor } = this.rest[n];
			if (k >= 1) {
				attr.array.set(pos);
				normal.array.set(nor);
				attr.needsUpdate = normal.needsUpdate = true;
				return;
			}
			// Loose while flat, exactly aligned while rolled, so the ends of the roll stay clean.
			// The second sheet is the layer between the turns of the first, half a turn's spacing further in.
			const r0 = n === 0 ? ROLL_R : ROLL_R - ROLL_TIGHTEN * Math.PI;
			// The sheet's own curl and sag only come back as it finishes opening.
			const relax = THREE.MathUtils.smoothstep(k, 0.7, 1);
			const L = k * DOC_H;
			const lift = (1 - k) * ROLL_LIFT;
			const fwd = (1 - k) * ROLL_R;
			for (let i = 0; i < attr.count; i++) {
				const x = pos[i * 3];
				const s = pos[i * 3 + 1] + DOC_H / 2;
				const z0 = pos[i * 3 + 2] * relax;
				let y = s;
				let z = z0;
				if (s > L) {
					const arc = Math.min(s - L, (r0 * r0) / (2 * ROLL_TIGHTEN) - 1e-4);
					const theta = (r0 - Math.sqrt(r0 * r0 - 2 * ROLL_TIGHTEN * arc)) / ROLL_TIGHTEN;
					const rho = r0 - ROLL_TIGHTEN * theta;
					y = L + rho * Math.sin(theta);
					z = z0 - ROLL_R + rho * Math.cos(theta);
				}
				attr.setXYZ(i, x, y - DOC_H / 2 + lift, z + fwd);
			}
			attr.needsUpdate = true;
			mesh.geometry.computeVertexNormals();
		});
	}

	/** Two tabs along the left edge naming the parts of the request that behave differently. */
	private buildTabs() {
		const make = (text: string, y: number, h: number, fill: string, ink: string) => {
			const g = new THREE.Group();
			const b = new Batch();
			const mat = new THREE.MeshStandardMaterial({ color: fill, roughness: 0.45 });
			this.tabMats.push(mat);
			b.add(rbox(0.3, h, 0.03, 0.04, 3), mat);
			g.add(b.build('tab'));
			const label = new Label(text, 0.12, { color: ink, font: font.sans, weight: 650 });
			label.mesh.rotation.z = Math.PI / 2;
			label.mesh.position.set(0, 0, 0.018);
			g.add(label.mesh);
			g.position.set(-DOC_W / 2 - 0.12, y, 0.02);
			return g;
		};
		this.tabs.add(make('stays the same', 0.17, 1.52, color.cobalt, '#ffffff'));
		this.tabs.add(make('grows', -1.01, 0.5, color.amber, color.ink));
	}

	setTabs(v: number) {
		this.tabs.children.forEach((tab, i) => {
			const k = THREE.MathUtils.clamp(v * 2 - i * 0.5, 0, 1);
			tab.scale.set(k, 1, 1);
			tab.position.x = -DOC_W / 2 - 0.12 * k + (1 - k) * 0.14;
			tab.visible = k > 0.001;
		});
	}

	bake(strips: HTMLCanvasElement[]) {
		this.baked.draw((c, w, h) => {
			c.drawImage(this.surface.canvas, 0, 0);
			const sw = (STRIP_W / DOC_W) * w;
			const sh = (STRIP_H / DOC_H) * h;
			strips.forEach((strip, i) => {
				c.drawImage(strip, (w - sw) / 2, ((DOC_H / 2 - SLOT_Y[i]) / DOC_H) * h - sh / 2, sw, sh);
			});
		});
	}

	setFilled(on: boolean) {
		if (on === this.filled) return;
		this.filled = on;
		this.sheet.material.map = on ? this.baked.texture : this.surface.texture;
		this.sheet.material.needsUpdate = true;
	}

	setClip(planes: THREE.Plane[]) {
		this.sheet.material.clippingPlanes = planes;
		this.back.material.clippingPlanes = planes;
		this.sheet.material.clipShadows = true;
		this.back.material.clipShadows = true;
	}

	setHarness(spec: HarnessSpec) {
		this.surface.draw((c, w, h) => {
			c.fillStyle = color.paper;
			c.fillRect(0, 0, w, h);
			const toY = (docY: number) => ((DOC_H / 2 - docY) / DOC_H) * h;
			const x = 92;

			c.textBaseline = 'alphabetic';
			c.font = `800 118px ${font.display}`;
			c.letterSpacing = '-3px';
			c.fillStyle = color.ink;
			c.fillText('JSON', x - 6, 148);
			c.letterSpacing = '0px';

			c.font = `500 31px ${font.mono}`;
			c.fillStyle = '#5a6b85';
			c.fillText(`POST ${spec.host}`, x, 196);

			const key = (s: string, docY: number) => {
				c.font = `700 40px ${font.mono}`;
				c.fillStyle = '#b05a00';
				c.fillText(`"${s}":`, x + 22, toY(docY));
			};
			c.font = `700 56px ${font.mono}`;
			c.fillStyle = color.ink;
			c.fillText('{', x, 262);
			key(spec.fields.system, 0.88);
			key(spec.fields.tools, -0.14);
			key(spec.fields.messages, -0.73);
			c.font = `700 56px ${font.mono}`;
			c.fillStyle = color.ink;
			c.fillText('}', x, toY(-1.34));

			// Empty slots, so the page visibly waits to be filled.
			c.strokeStyle = 'rgba(60,84,120,.5)';
			c.lineWidth = 3;
			c.setLineDash([12, 10]);
			const sw = (STRIP_W / DOC_W) * w;
			const sh = (STRIP_H / DOC_H) * h;
			SLOT_Y.forEach((y) => {
				c.beginPath();
				c.roundRect((w - sw) / 2, toY(y) - sh / 2, sw, sh, 8);
				c.stroke();
			});
			c.setLineDash([]);
		});
	}
}

/** The stand. Its uprights fold into the base when there is no page to hold, so it never stands empty. */
export function createEasel() {
	const m = mats();
	const group = new THREE.Group();
	const b = new Batch();
	b.add(rbox(2.6, 0.12, 1.1, 0.05, 3), m.steelSoft, { p: [0, 0.06, 0] });
	b.add(rbox(2.36, 0.06, 0.22, 0.02, 2), m.recess, { p: [0, 0.13, 0.2] });
	group.add(b.build('easel'));
	const l = new Batch();
	for (const s of [-1, 1]) {
		l.add(rbox(0.1, 1.5, 0.06, 0.025, 2), m.steel, { p: [s * 0.8, 0.72, -0.1], r: [-0.14, 0, 0] });
	}
	const legs = l.build('easel-legs');
	legs.position.y = 0.1;
	group.add(legs);
	return { group, legs };
}
