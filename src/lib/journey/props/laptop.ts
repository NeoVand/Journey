import * as THREE from 'three';
import { hitBox } from '../poke';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { mats } from '../kit/materials';
import { fitting } from '../kit/parts';
import { font, Surface } from '../kit/print';
import { smooth } from '../kit/math';
import { PROMPT, type HarnessSpec } from '../content';

const W = 3.3;
const D = 2.2;
const BASE_H = 0.12;
const LID_H = 2.12;
const LID_T = 0.07;
/** Where its cable plugs in, on the side of the base, in the laptop's own space. */
export const LAPTOP_PORT: [number, number, number] = [W / 2, 0.06, -0.17];

type Key = { label: string; w: number; code: string };

const row = (keys: string[]): Key[] => keys.map((k) => ({ label: k, w: 1, code: k.toLowerCase() }));
const k = (label: string, w: number, code = label): Key => ({ label, w, code });

/** A real QWERTY layout, so the key that dips is the key the sentence actually needs. */
const LAYOUT: Key[][] = [
	[...row('` 1 2 3 4 5 6 7 8 9 0 - ='.split(' ')), k('delete', 1.5)],
	[k('tab', 1.5), ...row('Q W E R T Y U I O P [ ] \\'.split(' '))],
	[k('caps', 1.75), ...row("A S D F G H J K L ; '".split(' ')), k('return', 1.75)],
	[k('shift', 2.25), ...row('Z X C V B N M , . /'.split(' ')), k('shift', 2.25, 'rshift')],
	[k('fn', 1), k('ctrl', 1), k('opt', 1), k('cmd', 1.25), k('', 5, ' '), k('cmd', 1.25, 'rcmd'), k('opt', 1, 'ropt'), k('', 1, 'left'), k('', 1, 'right')]
];

/** A status that ends the turn, "Done: what changed", gives back what changed; any other status gives nothing. */
const summary = (status: string) => /^Done: (.+)$/.exec(status)?.[1] ?? null;

export class Laptop {
	group = new THREE.Group();
	lid = new THREE.Group();
	hit: THREE.Mesh;
	private screen: Surface;
	private screenMat: THREE.MeshBasicMaterial;
	private pressUniform = { value: new Float32Array(72) };
	private keyIndex = new Map<string, number>();
	private spec!: HarnessSpec;
	private typed = -1;
	private cursor = true;
	private sent = 0;
	private done = 0;
	/** What the agent is doing, under the prompt once it's sent. */
	private status = 'Building the request';

	constructor() {
		// Its name lets the conversation point at it: see pointer.svelte.ts.
		this.group.name = 'Laptop';
		const m = mats();
		const b = new Batch();

		// Base: an aluminium slab with a shallow keyboard well and a trackpad.
		b.add(rbox(W, BASE_H, D, 0.055, 4), m.steel, { p: [0, BASE_H / 2, 0] });
		const wellW = W - 0.26;
		const wellD = 1.13;
		const wellZ = -D / 2 + 0.2 + wellD / 2;
		b.add(rbox(wellW, 0.014, wellD, 0.006, 2), m.recess, { p: [0, BASE_H - 0.002, wellZ] });
		b.add(rbox(1.08, 0.008, 0.62, 0.04, 2), m.steelSoft, { p: [0, BASE_H + 0.001, D / 2 - 0.42] });
		// Rubber feet and hinge barrel.
		for (const x of [-1, 1]) {
			b.add(rbox(0.42, 0.1, 0.1, 0.04, 3), m.rubber, { p: [x * 0.96, BASE_H + 0.012, -D / 2 + 0.03] });
		}
		fitting(b, LAPTOP_PORT, [1, 0, 0], 0.04, { flange: 1.4 });
		this.group.add(b.build('laptop-base'));
		this.group.add(this.buildKeys(wellW - 0.06, wellD - 0.06, wellZ));

		// Lid, hinged at the back edge. Open = slightly past vertical.
		const lid = new Batch();
		const shell = extrude(roundedRect(W, LID_H, 0.11), LID_T, 0.022, 3, 10);
		lid.add(shell, m.steel, { p: [0, LID_H / 2, 0] });
		lid.add(extrude(roundedRect(W - 0.05, LID_H - 0.05, 0.09), 0.012, 0.004, 1, 10), m.recess, {
			p: [0, LID_H / 2, LID_T / 2 + 0.002]
		});
		this.lid.add(lid.build('laptop-lid'));

		this.screen = new Surface(1408, 864);
		// A display emits its own light: lit shading would only wash it out with glare.
		this.screenMat = new THREE.MeshBasicMaterial({ map: this.screen.texture });
		const sw = W - 0.2;
		const sh = LID_H - 0.21;
		const display = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), this.screenMat);
		display.position.set(0, LID_H / 2 + 0.01, LID_T / 2 + 0.012);
		this.lid.add(display);

		this.lid.position.set(0, BASE_H + 0.02, -D / 2 + 0.03);
		this.group.add(this.lid);
		this.hit = hitBox(W, LID_H + 0.3, D + 0.4);
		this.hit.position.y = (LID_H + 0.3) / 2;
		this.group.add(this.hit);
	}

	private buildKeys(width: number, depth: number, z: number) {
		const units = 14.5;
		const u = width / units;
		const rowD = depth / LAYOUT.length;
		const parts: THREE.BufferGeometry[] = [];
		const legend = new Surface(1024, Math.round((1024 * depth) / width));
		const c = legend.ctx;
		c.fillStyle = '#232d45';
		c.fillRect(0, 0, legend.w, legend.h);
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillStyle = '#e6edf8';

		let index = 0;
		const pxU = legend.w / units;
		const pxR = legend.h / LAYOUT.length;
		LAYOUT.forEach((keys, r) => {
			let cursor = 0;
			keys.forEach((key) => {
				const kw = key.w * u;
				const kx = -width / 2 + (cursor + key.w / 2) * u;
				const kz = z - depth / 2 + (r + 0.5) * rowD;
				const g = rbox(kw - 0.018, 0.034, rowD - 0.018, 0.012, 2);
				const pos = g.attributes.position as THREE.BufferAttribute;
				const uv = g.attributes.uv as THREE.BufferAttribute;
				const id = new Float32Array(pos.count);
				for (let i = 0; i < pos.count; i++) {
					const px = pos.getX(i) + kx;
					const pz = pos.getZ(i) + kz;
					uv.setXY(i, (px + width / 2) / width, 1 - (pz - (z - depth / 2)) / depth);
					pos.setXYZ(i, px, pos.getY(i) + BASE_H + 0.022, pz);
					id[i] = index;
				}
				g.setAttribute('keyIndex', new THREE.BufferAttribute(id, 1));
				parts.push(g);
				this.keyIndex.set(key.code, index);

				if (key.label) {
					const small = key.label.length > 1;
					c.font = `${small ? 500 : 600} ${small ? pxR * 0.24 : pxR * 0.42}px ${font.sans}`;
					c.fillText(small ? key.label : key.label.toUpperCase(), (cursor + key.w / 2) * pxU, (r + 0.54) * pxR);
				}
				index++;
				cursor += key.w;
			});
		});
		legend.texture.needsUpdate = true;

		const merged = mergeWithKeyIndex(parts);
		const material = new THREE.MeshStandardMaterial({
			map: legend.texture,
			roughness: 0.42,
			metalness: 0.05
		});
		const press = this.pressUniform;
		material.onBeforeCompile = (shader) => {
			shader.uniforms.uPress = press;
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nattribute float keyIndex;\nuniform float uPress[72];')
				.replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y -= uPress[int(keyIndex + 0.5)] * 0.02;');
		};
		const mesh = new THREE.Mesh(merged, material);
		mesh.castShadow = true;
		mesh.receiveShadow = true;
		mesh.name = 'keys';
		return mesh;
	}

	setHarness(spec: HarnessSpec) {
		this.spec = spec;
		this.redraw();
	}

	/**
	 * typed: characters of the prompt already entered (fractional, so keys travel between letters).
	 * sent: 0 to 1, the prompt has left the input and moved up into the transcript.
	 */
	update(typedF: number, sent: number, time: number, lidOpen: number, keysOn: boolean) {
		// Enter is the one key anybody hits hard: the lid feels it, and shivers back.
		const thud = Math.max(0, sent - 0.22) / 0.78;
		const shiver = thud > 0 ? Math.sin(thud * Math.PI * 7) * Math.exp(-5 * thud) * 0.05 : 0;
		this.lid.rotation.x = THREE.MathUtils.lerp(Math.PI / 2, -0.2, lidOpen) + shiver;

		const press = this.pressUniform.value;
		press.fill(0);
		if (keysOn) {
			const i = Math.floor(typedF);
			const frac = typedF - i;
			if (i >= 0 && i < PROMPT.length && frac > 0) {
				const code = PROMPT[i].toLowerCase();
				const down = Math.sin(smooth(Math.min(1, frac)) * Math.PI);
				const idx = this.keyIndex.get(code);
				if (idx !== undefined) press[idx] = down;
				if (PROMPT[i] !== PROMPT[i].toLowerCase()) {
					const shift = this.keyIndex.get('shift');
					if (shift !== undefined) press[shift] = down;
				}
			}
			if (typedF >= PROMPT.length && sent > 0 && sent < 0.5) {
				const ret = this.keyIndex.get('return');
				if (ret !== undefined) press[ret] = Math.sin(sent * 2 * Math.PI);
			}
		}

		const typed = Math.min(PROMPT.length, Math.floor(typedF));
		// Solid while the keys are going, as a real cursor is. It only blinks once it's waiting for you.
		const cursor = typedF < PROMPT.length || Math.floor(time * 1.8) % 2 === 0;
		const s = Math.round(sent * 40) / 40;
		if (typed !== this.typed || cursor !== this.cursor || s !== this.sent) {
			this.typed = typed;
			this.cursor = cursor;
			this.sent = s;
			this.redraw();
		}
	}

	/** Says what the agent is doing now, under the prompt. */
	say(status: string) {
		if (status === this.status) return;
		this.status = status;
		this.redraw();
	}

	/** The last frame of the story: the same screen, with the result on it. */
	finish(k: number) {
		const v = Math.round(k * 20) / 20;
		if (v === this.done) return;
		this.done = v;
		this.redraw();
	}

	private drawDone(c: CanvasRenderingContext2D, w: number, h: number) {
		c.globalAlpha = this.done;
		const dark = this.spec.surface === 'terminal';
		c.fillStyle = dark ? '#0d1d3f' : '#fbfcfe';
		c.fillRect(0, dark ? 70 : 62, w, h);
		const ink = dark ? '#f4f8ff' : '#111a2e';
		c.textBaseline = 'alphabetic';
		c.textAlign = 'left';
		c.font = `700 72px ${font.mono}`;
		c.fillStyle = dark ? '#5fe39b' : '#0f8a4a';
		c.fillText('418 passed', 72, 210);
		c.font = `500 52px ${font.mono}`;
		c.fillStyle = ink;
		c.fillText('src/scheduler.py', 72, 320);
		c.fillStyle = dark ? '#5fe39b' : '#0f8a4a';
		c.fillText('+ with self._lock:', 72, 410);
		c.fillStyle = dark ? '#ff8d85' : '#c9372c';
		c.fillText('- Lock()   + RLock()', 72, 500);
		c.font = `600 56px ${font.sans}`;
		c.fillStyle = ink;
		c.fillText('Fixed. Added a test with two', 72, 640);
		c.fillText('worker threads. Ready for review.', 72, 720);
		c.globalAlpha = 1;
	}

	private redraw() {
		if (!this.spec) return;
		this.screen.draw((c, w, h) => {
			if (this.spec.surface === 'terminal') this.drawTerminal(c, w, h);
			else this.drawEditor(c, w, h);
			if (this.done > 0) this.drawDone(c, w, h);
		});
	}

	private drawTerminal(c: CanvasRenderingContext2D, w: number, h: number) {
		c.fillStyle = '#0d1d3f';
		c.fillRect(0, 0, w, h);

		// Title bar.
		c.fillStyle = '#132a57';
		c.fillRect(0, 0, w, 70);
		['#ff6159', '#ffbd2e', '#28c941'].forEach((col, i) => {
			c.fillStyle = col;
			c.beginPath();
			c.arc(44 + i * 38, 35, 12, 0, Math.PI * 2);
			c.fill();
		});
		c.fillStyle = '#9db6df';
		c.font = `500 30px ${font.mono}`;
		c.textAlign = 'center';
		c.textBaseline = 'middle';
		c.fillText(`${this.spec.folder}  ${this.spec.id === 'claude' ? 'claude' : 'codex'}`, w / 2, 36);
		c.textAlign = 'left';

		const size = 88;
		const lh = size * 1.28;
		const x = 72;
		c.font = `600 ${size}px ${font.mono}`;
		c.textBaseline = 'alphabetic';

		const y0 = 240 - this.sent * 90;
		const lines = upTo(wrap(c, PROMPT, w - x - 190), this.typed);

		c.fillStyle = '#6fd4ff';
		c.fillText('>', x, y0);
		c.fillStyle = '#f4f8ff';
		lines.forEach((l, i) => c.fillText(l, x + 92, y0 + i * lh));

		const last = lines[lines.length - 1] ?? '';
		if (this.cursor && this.sent === 0) {
			const cw = c.measureText(last).width;
			c.fillStyle = '#ffc53d';
			c.fillRect(x + 92 + cw + 8, y0 + (lines.length - 1) * lh - size * 0.8, size * 0.56, size * 0.98);
		}

		if (this.sent > 0.5) {
			const a = (this.sent - 0.5) * 2;
			const y = y0 + lines.length * lh + 34;
			const done = summary(this.status);
			if (done) {
				// The turn's last word is its summary, the one thing on the screen meant to be read from across the room.
				c.font = `700 72px ${font.mono}`;
				c.fillStyle = `rgba(95,227,154,${a})`;
				c.fillText('Done.', x, y + 40);
				c.font = `500 56px ${font.mono}`;
				c.fillStyle = `rgba(244,248,255,${a})`;
				c.fillText(done, x, y + 40 + 80);
			} else {
				c.font = `500 44px ${font.mono}`;
				c.fillStyle = `rgba(255,197,61,${a})`;
				c.fillText(this.status, x, y);
			}
		}
	}

	private drawEditor(c: CanvasRenderingContext2D, w: number, h: number) {
		c.fillStyle = '#eef2f8';
		c.fillRect(0, 0, w, h);
		// Title bar and activity bar.
		c.fillStyle = '#d8e0ec';
		c.fillRect(0, 0, w, 62);
		['#ff6159', '#ffbd2e', '#28c941'].forEach((col, i) => {
			c.fillStyle = col;
			c.beginPath();
			c.arc(40 + i * 34, 31, 11, 0, Math.PI * 2);
			c.fill();
		});
		c.fillStyle = '#1b4bb8';
		c.fillRect(0, 62, 74, h);

		// Editor column with the scheduler open.
		const edW = 430;
		c.fillStyle = '#fbfcfe';
		c.fillRect(74, 62, edW, h);
		c.font = `500 25px ${font.mono}`;
		c.fillStyle = '#5a6b85';
		c.textBaseline = 'alphabetic';
		c.fillText('scheduler.py', 100, 106);
		const code: [number, string][] = [
			[0.7, '#1f5fe0'],
			[0.5, '#2a3a55'],
			[0.86, '#2a3a55'],
			[0.42, '#c0651a'],
			[0.72, '#2a3a55'],
			[0.3, '#1f5fe0'],
			[0.6, '#2a3a55'],
			[0.8, '#2a3a55'],
			[0.45, '#c0651a'],
			[0.65, '#2a3a55'],
			[0.35, '#2a3a55'],
			[0.75, '#1f5fe0'],
			[0.5, '#2a3a55']
		];
		code.forEach(([len, col], i) => {
			c.fillStyle = col;
			c.globalAlpha = 0.72;
			c.beginPath();
			c.roundRect(100 + (i % 3) * 20, 136 + i * 52, (edW - 90) * len, 16, 8);
			c.fill();
		});
		c.globalAlpha = 1;

		// Chat panel.
		const px = 74 + edW;
		const pw = w - px;
		c.fillStyle = '#e4ebf5';
		c.fillRect(px, 62, pw, h);
		c.font = `600 34px ${font.sans}`;
		c.fillStyle = '#2a3a55';
		c.fillText('Chat', px + 36, 118);

		const bx = px + 30;
		const by = 150 - this.sent * 10;
		const bw = pw - 60;
		const size = 66;
		const lh = size * 1.25;
		c.font = `600 ${size}px ${font.mono}`;
		const whole = wrap(c, PROMPT, bw - 66);
		const lines = upTo(whole, this.typed);
		const bh = Math.max(4, whole.length + 1) * lh + 24;
		c.fillStyle = '#fff';
		c.beginPath();
		c.roundRect(bx, by, bw, bh, 28);
		c.fill();
		c.strokeStyle = '#1f5fe0';
		c.lineWidth = 5;
		c.stroke();
		c.fillStyle = '#111a2e';
		lines.forEach((l, i) => c.fillText(l, bx + 32, by + 92 + i * lh));
		const last = lines[lines.length - 1] ?? '';
		if (this.cursor && this.sent === 0) {
			const cw = c.measureText(last).width;
			c.fillStyle = '#1f5fe0';
			c.fillRect(bx + 32 + cw + 6, by + 92 + (lines.length - 1) * lh - size * 0.8, 8, size * 0.98);
		}
		if (this.sent > 0.5) {
			const a = (this.sent - 0.5) * 2;
			const done = summary(this.status);
			if (done) {
				c.font = `700 52px ${font.sans}`;
				c.fillStyle = `rgba(15,138,79,${a})`;
				c.fillText('Done.', bx + 6, by + bh + 66);
				c.font = `600 40px ${font.sans}`;
				c.fillStyle = `rgba(17,26,46,${a})`;
				c.fillText(done, bx + 6, by + bh + 66 + 56);
			} else {
				c.font = `600 38px ${font.sans}`;
				c.fillStyle = `rgba(31,95,224,${a})`;
				c.fillText(this.status, bx + 6, by + bh + 58);
			}
		}
	}

	/** Where a request visually leaves the screen, in the laptop's space. */
	screenPoint(target: THREE.Vector3) {
		return this.lid.localToWorld(target.set(0, LID_H * 0.6, 0.1));
	}
}

function wrap(c: CanvasRenderingContext2D, text: string, max: number) {
	if (!text) return [''];
	const words = text.split(' ');
	const lines: string[] = [];
	let line = '';
	for (let i = 0; i < words.length; i++) {
		const next = line ? `${line} ${words[i]}` : words[i];
		if (c.measureText(next).width > max && line) {
			lines.push(line);
			line = words[i];
		} else {
			line = next;
		}
	}
	lines.push(line);
	return lines;
}

/** The first n characters of some wrapped lines, so a word being typed never jumps to the next line halfway through. */
function upTo(lines: string[], n: number) {
	const shown: string[] = [];
	for (const line of lines) {
		if (n < 0) break;
		shown.push(line.slice(0, n));
		n -= line.length + 1;
	}
	return shown;
}

function mergeWithKeyIndex(parts: THREE.BufferGeometry[]) {
	let count = 0;
	parts.forEach((g) => (count += g.attributes.position.count));
	const pos = new Float32Array(count * 3);
	const nor = new Float32Array(count * 3);
	const uv = new Float32Array(count * 2);
	const key = new Float32Array(count);
	let off = 0;
	for (const g of parts) {
		pos.set(g.attributes.position.array as Float32Array, off * 3);
		nor.set(g.attributes.normal.array as Float32Array, off * 3);
		uv.set(g.attributes.uv.array as Float32Array, off * 2);
		key.set(g.attributes.keyIndex.array as Float32Array, off);
		off += g.attributes.position.count;
		g.dispose();
	}
	const merged = new THREE.BufferGeometry();
	merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
	merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
	merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
	merged.setAttribute('keyIndex', new THREE.BufferAttribute(key, 1));
	return merged;
}
