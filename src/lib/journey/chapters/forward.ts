import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox, ring, sharedRbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { archInto, arcPoint, Card, machine, panel, shadowOn } from '../kit/machines';
import { bezel, craft, fan, guards, loaf, loafBeads, louvre, pane, pipe } from '../kit/craft';
import { contactShadow, font, Label, Surface } from '../kit/print';
import { createSign, grown, SIGN_PHONE, signWidth, standSign } from '../kit/parts';
import { bell, hash, inCubic, inOut, lerp, outBack, outCubic, seg, smooth } from '../kit/math';
import { createPad } from '../props/board';
import { Tile, TILE_D, TILE_H } from '../props/tokenizer';
import { CALL_IDS, CALLS, LOGITS, TOP_K, wheelOdds, type HarnessId } from '../content';
import { ORIGIN, PAD_Y, RAIL_Y, RAIL_Z } from '../layout';
import type { Shot } from '../rig';
import { KvRow, MAP_D, MAP_W, MapPlate, LOGITS_FLY, LOGITS_LINE, LOGITS_ROW, PICK_STARTS, PICK_W, TOKEN_PATHS, Transformer, TRANSFORMER_SHOTS } from './transformer';

const WHEEL = 193;
const DEC = 233;
/** The detokenizer stands at the row's left end, in the gap between the sampler and the stack. The belt runs the row
 * left into it, so the oldest token goes in first and the text streams out in the order it was written. */
const DET = DEC - 21.5;
const ROW0 = DEC - 13;
const BACK_Z = -2.4;
/* The decode step is the same stack as the forward pass, at half the size, with one token climbing it. */
const STACK_X = DEC - 10; // far enough along that the tool call's text never lands on it
const SCALE = 8.6 / MAP_W;
const FLOOR_Y = [PAD_Y + 1.5, PAD_Y + 3.3, PAD_Y + 5.1, PAD_Y + 7.6];
const SPOTS: [number, number][] = [
	[2.9, 2.2],
	[2.4, 1.2],
	[1.6, 0.7],
	[1.1, 0.4]
];
const MAX_PAIRS = 36;

const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [ORIGIN.x + x, ORIGIN.y + y, ORIGIN.z + z];
const TALL = box(0, 0.06, 1, 0.47);

const S_WHEEL: Omit<Shot, 'T'> = { az: 8, el: 9, target: at(WHEEL - 0.4, 3.4, 0), radius: 9.2, ry: 4.3, wide: box(0, 0.07, 0.56, 0.88), tall: box(0, 0.05, 1, 0.34) };
const S_DEC: Omit<Shot, 'T'> = { az: 10, el: 17, target: at(DEC - 9, 4, 0.8), radius: 7.4, ry: 5.2, wide: box(0.41, 0.05, 0.58, 0.9), tall: TALL };
const S_CALL: Omit<Shot, 'T'> = { az: -6, el: 56, target: at(DEC + 6.7, 0.8, 4.4), radius: 7.7, ry: 3.2, wide: box(0.02, 0.4, 0.96, 0.56), tall: box(0, 0.08, 1, 0.42), tallTarget: at(DEC + 3.8, 0.8, 4.2), tallRadius: 4.9 };
// On a phone the ticket and the board don't fit side by side at a size you can read, so the camera goes to the ticket first and takes in both for the verdict.
const S_CALL_WHY: Omit<Shot, 'T'> = { ...S_CALL, az: -5, tallTarget: at(DEC + 8.4, 0.9, 4.2), tallRadius: 5.6 };
// From the right, where the row comes in from, with the words on the left.
const S_DET: Omit<Shot, 'T'> = { az: 14, el: 13, target: at(DET, 3.2, 3.5), radius: 7, ry: 4.3, wide: box(0.4, 0.07, 0.59, 0.88), tall: TALL };

/* The logits chart, on its way from the top of the stack to the board. Its path is shared with the camera that follows it. */
const BOARD_X = -4.8;
const BAR_GAP = 6.9 / 7;
const BAR_Y = PAD_Y + 0.84;
const BAR_Z = 0.28;
const ROW_X = LOGITS_ROW.x - WHEEL;
function chartAt(k: number, out: THREE.Vector3) {
	const u = 1 - k;
	const w0 = u * u * u;
	const w1 = 3 * u * u * k;
	const w2 = 3 * u * k * k;
	const w3 = k * k * k;
	// Out past the map's edge at its own height, then straight down in front of the board.
	return out.set(
		w0 * ROW_X + w1 * (BOARD_X - 1.2) + w2 * BOARD_X + w3 * BOARD_X,
		w0 * LOGITS_ROW.y + w1 * (LOGITS_ROW.y + 1.3) + w2 * (LOGITS_ROW.y - 0.2) + w3 * BAR_Y,
		w0 * LOGITS_ROW.z + w1 * LOGITS_ROW.z + w2 * 0.8 + w3 * BAR_Z
	);
}
const CHART_SHOTS: Shot[] = [0.16, 0.34, 0.5, 0.66, 0.84].map((k) => {
	const c = chartAt(inOut(k), new THREE.Vector3());
	const near = smooth(seg(k, 0.5, 1));
	return {
		T: LOGITS_FLY[0] + (LOGITS_FLY[1] - LOGITS_FLY[0]) * k,
		az: 8,
		el: lerp(30, 9, smooth(k)),
		target: at(WHEEL + c.x, c.y + 1.3, c.z),
		radius: lerp(6, 8, near),
		ry: lerp(4.4, 4.3, near),
		wide: box(0.22, 0.1, 0.6, 0.8),
		tall: TALL
	};
});

export const FORWARD_SHOTS: Shot[] = [
	...TRANSFORMER_SHOTS,
	...CHART_SHOTS,
	{ T: 15.096, ...S_WHEEL },
	{ T: 15.9, ...S_WHEEL, az: -5 },
	{ T: 16.04, ...S_DEC },
	{ T: 16.9, ...S_DEC, az: 11 },
	{ T: 17.06, ...S_CALL },
	{ T: 17.8, ...S_CALL, az: -5.2 },
	{ T: 17.87, ...S_CALL_WHY },
	{ T: 17.95, ...S_CALL_WHY },
	{ T: 18.06, ...S_DET },
	{ T: 18.62, ...S_DET, az: 9 },
	{ T: 18.97, ...S_DET, az: 6, el: 40, target: at(DET, 13, 1.9), radius: 2.6, ry: 2.6 }
];

/* ------------------------------------------------------------------ sampler ---- */

const SPINS = 4;
const PEGS = 30;
/** The wheel's slices, in the order of the odds: the favourite first. */
const SLICE = ['#ffbc12', '#3b76ec', '#fbf1dd', '#22b866', '#f08a3c'];
/** Where each slice's share leaves its bar, and when its slice sweeps open, as fractions of the pour. */
const POUR = { gap: 0.13, fly: 0.3, open: [0.26, 0.48] as [number, number] };

class Sampler {
	group = new THREE.Group();
	private bars: { mesh: THREE.Mesh; sign: THREE.Group; home: THREE.Vector3; h: number; cut: boolean }[] = [];
	private wheel = new THREE.Group();
	private wheelFace = new Surface(1200, 1200);
	wheelDisc!: THREE.Mesh;
	private flapper: THREE.Group;
	private temperature = 1;
	private dirty = false;
	private lastPaint = 0;
	/** The reader's own spin, on top of the story's. */
	private extra = 0;
	private play: { from: number; to: number; start: number; duration: number; land: () => void } | null = null;
	private restAt = -1;
	private storyAngle = 0;
	private lastAngle = 0;
	private flap = 0;
	/**
	 * The wheel has no slices until the scores pour into it: each kept bar sends its share across, and its slice sweeps
	 * open where it lands. Read by the face's shader.
	 */
	private face = {
		uFill: { value: [0, 0, 0, 0, 0] },
		uEdge: { value: [0, 0, 0, 0, 0, 0] },
		uStart: { value: 0 },
		uBlank: { value: new THREE.Color('#22304f') }
	};
	private drops: THREE.Mesh[] = [];
	private wheelR = 2.9;
	private chosen: Tile;
	private sign: THREE.Group;
	private lamp: Lamp;
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private c = new THREE.Vector3();
	private tint = new THREE.Color();
	private from = new THREE.Vector3(3.6, PAD_Y + 6.6, 1.5); // in front of the wheel, so it can fall past it
	private to = new THREE.Vector3(ROW0 - WHEEL, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
	private dock = new THREE.Vector3(3.6, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);

	constructor() {
		const m = mats();
		this.group.position.x = WHEEL;
		const pad = createPad(20, 9.4);
		pad.position.set(0, PAD_Y, 0);
		this.group.add(pad);

		// The logits board.
		const lx = BOARD_X;
		const board = machine({ w: 7.4, h: 4.6, d: 1.2, finish: 'cream', name: 'Logits: the highest scores', signH: 0.24, vent: false });
		board.position.set(lx, PAD_Y, -0.6);
		this.group.add(board);
		// A dark window for the scores to arrive in, in a chrome bezel; a cobalt crown along its top, as the pools and
		// the detokenizer have, with a chrome lip and beads.
		const c = craft();
		const logitsWindow = new Batch();
		logitsWindow.add(rbox(7, 3.14, 0.04, 0.05, 2), m.recess, { p: [lx, PAD_Y + 2.36, 0.015] });
		bezel(logitsWindow, 6.98, 3.12, [lx, PAD_Y + 2.36, 0], { t: 0.05, r: 0.06, depth: 0.04 });
		// Inside the flat of the board's top, clear of its chamfers and its rounded edges.
		const crown = { w: 6.2, d: 0.98, h: 0.52, r: 0.2, y: PAD_Y + 4.74 };
		logitsWindow.add(loaf(crown.w, crown.d, crown.h, crown.r), m.cobalt, { p: [lx, crown.y, -0.6] });
		logitsWindow.add(rbox(crown.w + 0.04, 0.05, crown.d + 0.04, 0.02, 1), c.chrome, { p: [lx, crown.y + 0.025, -0.6] });
		loafBeads(logitsWindow, crown.w, crown.d, crown.h, crown.r, [lx, crown.y, -0.6]);
		this.group.add(logitsWindow.build('logits-window'));
		shadowOn(this.group, lx, PAD_Y, -0.6, 7.6, 1.4);
		const plate = new Surface(1480, 150);
		plate.draw((c, w, h) => {
			c.fillStyle = color.ink;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.font = `600 62px ${font.mono}`;
			LOGITS.forEach((l, i) => c.fillText(l.text, ((i + 0.5) / LOGITS.length) * w, h / 2));
		});
		const label = panel(6.9, (6.9 * 150) / 1480, plate);
		label.position.set(lx, PAD_Y + 0.56, 0.16);
		this.group.add(label);
		const barGeo = rbox(0.66, 1, 0.34, 0.06, 2);
		barGeo.translate(0, 0.5, 0);
		LOGITS.forEach((l, i) => {
			const mat = (m.amber as THREE.MeshPhysicalMaterial).clone();
			const mesh = new THREE.Mesh(barGeo, mat);
			const home = new THREE.Vector3(lx + ((i + 0.5) / LOGITS.length - 0.5) * 6.9, BAR_Y, BAR_Z);
			mesh.position.copy(home);
			mesh.castShadow = true;
			this.group.add(mesh);
			// Fitted: each word sits under its own bar, about a metre apart.
			const sign = createSign(l.text, 0.36, undefined, undefined, true);
			this.group.add(sign);
			this.bars.push({ mesh, sign, home, h: l.score * 0.82, cut: i >= TOP_K });
		});

		// The wheel of the next token.
		const wx = 3.6;
		const R = 2.9;
		const cy = PAD_Y + 3.5;
		this.paintWheel();
		const faceMat = new THREE.MeshStandardMaterial({ map: this.wheelFace.texture, roughness: 0.45 });
		faceMat.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, this.face);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', '#include <common>\nuniform float uFill[5];\nuniform float uEdge[6];\nuniform float uStart;\nuniform vec3 uBlank;')
				.replace(
					'#include <map_fragment>',
					`#include <map_fragment>
					{
						// As the canvas has it: y down, angles clockwise from +x.
						vec2 p = vec2(vMapUv.x - 0.5, 0.5 - vMapUv.y);
						if (length(p) > 0.077) {
							float rel = mod(atan(p.y, p.x) - uStart, 6.2831853);
							float shown = 0.0;
							for (int i = 0; i < 5; i++) {
								if (rel >= uEdge[i] && rel < uEdge[i + 1]) shown = step((rel - uEdge[i]) / max(1e-4, uEdge[i + 1] - uEdge[i]), uFill[i]);
							}
							diffuseColor.rgb = mix(uBlank, diffuseColor.rgb, shown);
						}
					}`
				);
		};
		const face = new THREE.Mesh(new THREE.CircleGeometry(R, 96), faceMat);
		this.wheelDisc = face;
		face.position.z = 0.1;
		this.wheel.add(face);
		const wb = new Batch();
		wb.add(new THREE.TorusGeometry(R, 0.14, 14, 96), m.steel);
		for (let i = 0; i < PEGS; i++) {
			const ang = (i / PEGS) * Math.PI * 2;
			wb.add(new THREE.CylinderGeometry(0.045, 0.045, 0.24, 8), m.steel, {
				p: [Math.cos(ang) * (R - 0.14), Math.sin(ang) * (R - 0.14), 0.16],
				r: [Math.PI / 2, 0, 0]
			});
		}
		wb.add(new THREE.CylinderGeometry(R - 0.02, R - 0.02, 0.18, 96), m.slate, { r: [Math.PI / 2, 0, 0] });
		this.wheel.add(wb.build('wheel'));
		this.wheel.position.set(wx, cy, 0.4);
		this.group.add(this.wheel);

		const stand = new Batch();
		stand.add(rbox(4.4, 0.2, 2.2, 0.06, 3), m.steelSoft, { p: [wx, PAD_Y + 0.1, 0] });
		stand.add(rbox(4.46, 0.04, 2.26, 0.015, 1), c.chrome, { p: [wx, PAD_Y + 0.2, 0] });
		for (const sx of [-1, 1]) {
			stand.add(rbox(0.3, cy - PAD_Y, 0.5, 0.08, 3), m.cream, { p: [wx + sx * 1.15, PAD_Y + (cy - PAD_Y) / 2, -0.2], r: [0, 0, sx * 0.3] });
		}
		stand.add(new THREE.CylinderGeometry(0.2, 0.2, 0.9, 20), m.steel, { p: [wx, cy, 0.1], r: [Math.PI / 2, 0, 0] });
		// A chrome cap on the axle behind the wheel, and a bearing ring where each leg meets the axle.
		stand.add(new THREE.CylinderGeometry(0.3, 0.3, 0.08, 24), c.chrome, { p: [wx, cy, -0.32], r: [Math.PI / 2, 0, 0] });
		stand.add(rbox(0.3, 0.3, 0.3, 0.06, 2), m.steel, { p: [wx, cy + R + 0.5, 0.62] });
		this.group.add(stand.build('wheel-stand'));
		// The flapper: hinged at the block, so the pegs really flick it as they go by.
		const flap = new Batch();
		flap.add(new THREE.ConeGeometry(0.22, 0.56, 4), m.red, { p: [0, -0.3, 0], r: [Math.PI, Math.PI / 4, 0] });
		this.flapper = flap.build('wheel-flapper');
		this.flapper.position.set(wx, cy + R + 0.5, 0.62);
		this.group.add(this.flapper);
		shadowOn(this.group, wx, PAD_Y, 0, 4.4, 2.2);
		this.sign = standSign(createSign('Sampler', 0.3), 0.3, 0.45);
		this.sign.position.set(wx - 3.4, PAD_Y + 0.75, 1.2);
		this.sign.rotation.y = 0.22;
		this.group.add(this.sign);
		this.lamp = new Lamp(sharedRbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.3);
		this.lamp.mesh.position.set(wx + 0.34, cy + R + 0.5, 0.79);
		this.group.add(this.lamp.mesh);

		// A share of each kept score, in its slice's colour, that flies from its bar to the wheel.
		SLICE.forEach((hex) => {
			const drop = new THREE.Mesh(rbox(0.42, 0.42, 0.3, 0.08, 2), new THREE.MeshStandardMaterial({ color: hex, emissive: hex, emissiveIntensity: 0.55, roughness: 0.35 }));
			drop.visible = false;
			drop.castShadow = true;
			this.group.add(drop);
			this.drops.push(drop);
		});

		this.chosen = new Tile({ text: 'The', id: 791, width: 0.92, special: false });
		this.chosen.update(1, 0);
		this.group.add(this.chosen.group);
	}

	/** For slice i, how far along the pour is: its share's flight, how far its slice has opened, and how much has left its bar. */
	private flight(pour: number, i: number) {
		const start = i * POUR.gap;
		const fly = seg(pour, start, start + POUR.fly);
		return { fly, open: smooth(seg(pour, start + POUR.open[0], start + POUR.open[1])), sent: smooth(seg(fly, 0, 0.4)) };
	}

	/** The wheel's slices are the real probabilities, so its face is repainted whenever the temperature moves. */
	private paintWheel() {
		const odds = wheelOdds(this.temperature);
		// Where the slices start and end, for the shader that keeps them shut until they're poured.
		this.face.uStart.value = -Math.PI / 2 - odds[0] * Math.PI;
		let edge = 0;
		this.face.uEdge.value = [0, ...odds.map((p) => (edge += p * Math.PI * 2))];
		this.face.uEdge.value[5] = Math.PI * 2 + 1e-3;
		this.wheelFace.draw((c, w, h) => {
			const cx = w / 2;
			const cy = h / 2;
			let a = -Math.PI / 2 - odds[0] * Math.PI;
			const fills = SLICE;
			odds.forEach((p, i) => {
				const span = p * Math.PI * 2;
				c.fillStyle = fills[i];
				c.beginPath();
				c.moveTo(cx, cy);
				c.arc(cx, cy, cx, a, a + span);
				c.closePath();
				c.fill();
				c.strokeStyle = '#111a2e';
				c.lineWidth = Math.min(7, 1 + span * 90);
				c.stroke();
				// A label goes where it fits: the bigger the slice, the bigger the word.
				if (span > 0.09) {
					c.save();
					c.translate(cx, cy);
					c.rotate(a + span / 2);
					c.textAlign = 'right';
					c.textBaseline = 'middle';
					c.fillStyle = i === 1 ? '#ffffff' : color.ink;
					c.font = `800 ${Math.round(Math.min(118, 60 + span * 40))}px ${font.display}`;
					// A lone "I" along the radius is only a dash, so it stands across the slice, in a face with serifs.
					if (LOGITS[i].text.length === 1) {
						c.font = `800 150px ${font.mono}`;
						c.translate(cx - 130, 0);
						c.rotate(Math.PI / 2);
						c.textAlign = 'center';
						c.fillText(LOGITS[i].text, 0, 0);
					} else c.fillText(LOGITS[i].text, cx - 62, 0);
					c.restore();
				}
				a += span;
			});
			c.fillStyle = '#111a2e';
			c.beginPath();
			c.arc(cx, cy, 92, 0, Math.PI * 2);
			c.fill();
		});
	}

	setTemperature(temperature: number) {
		this.temperature = temperature;
		this.dirty = true;
	}

	/** A real draw at the current temperature. The wheel comes to rest on it, and says which it was. */
	/** Spins and draws from the odds; or, given a slice, lands somewhere inside that one, as a conversation's example asks. */
	spin(reduced: boolean, want?: number) {
		return new Promise<number>((resolve) => {
			const odds = wheelOdds(this.temperature);
			let r = Math.random();
			let pick = 0;
			if (want !== undefined && want >= 0 && want < odds.length) {
				pick = want;
				r *= odds[pick];
			} else while (pick < odds.length - 1 && r > odds[pick]) r -= odds[pick++];
			// How far clockwise from the top this point on the wheel lies, with the favorite centred at zero.
			// It stops well inside its slice, because a pointer resting on a line would settle nothing.
			const before = odds.slice(0, pick).reduce((a, b) => a + b, 0);
			const inside = 0.15 + 0.7 * (r / odds[pick]);
			const at = (before + odds[pick] * inside - odds[0] / 2) * Math.PI * 2;
			const turn = Math.PI * 2;
			const from = this.extra;
			const far = from - turn * (reduced ? 1 : 5);
			// The story may have the wheel part way round already, so aim for the wheel's real angle.
			const aim = at - this.storyAngle;
			const to = far - ((((far - aim) % turn) + turn) % turn);
			const land = () => {
				this.play = null;
				this.restAt = -1;
				resolve(pick);
			};
			if (reduced) {
				this.extra = to;
				land();
			} else this.play = { from, to, start: performance.now(), duration: 3400, land };
		});
	}

	update(T: number, cut: number, pour: number, spin: number, pick: number, ride: number, time: number) {
		const now = performance.now();
		if (this.dirty && now - this.lastPaint > 70) {
			this.dirty = false;
			this.lastPaint = now;
			this.paintWheel();
		}
		if (this.play) {
			const k = Math.min(1, (now - this.play.start) / this.play.duration);
			this.extra = lerp(this.play.from, this.play.to, 1 - Math.pow(1 - k, 4));
			if (k >= 1) this.play.land();
		} else if (this.extra !== 0) {
			// Once the reader scrolls on, the story takes the wheel back: in this telling, it landed on "The".
			if (this.restAt < 0) this.restAt = T;
			if (Math.abs(T - this.restAt) > 0.006) {
				const turn = Math.PI * 2;
				const home = Math.round(this.extra / turn) * turn;
				this.extra = home + (this.extra - home) * 0.9;
				if (Math.abs(this.extra - home) < 0.002) this.extra = 0;
			}
		}
		this.bars.forEach((b, i) => {
			// The very columns that rose on the map. First they line up in order, which makes them a chart.
			const line = seg(T, LOGITS_LINE[0], LOGITS_LINE[1]);
			const k = seg(T, LOGITS_FLY[0], LOGITS_FLY[1]);
			const from = PICK_STARTS[i];
			const e = inOut(k);
			const across = smooth(seg(line, 0.14, 0.86));
			const slot = (i - 3) * BAR_GAP;
			// The two small ones have to cross the map, so they go over the others.
			const lane = (i === 5 ? 3.5 : i === 6 ? 3.9 : 0) * smooth(seg(line, 0.04, 0.3)) * (1 - smooth(seg(line, 0.74, 1)));
			if (k > 0) {
				chartAt(e, this.a);
				b.mesh.position.set(this.a.x + slot, this.a.y, this.a.z);
			} else {
				b.mesh.position.set(
					lerp(from.x - WHEEL, ROW_X + slot, across),
					lerp(from.y, LOGITS_ROW.y, smooth(seg(line, 0, 0.3))) + lane,
					lerp(from.z, LOGITS_ROW.z, across)
				);
			}
			const sink = b.cut ? 1 - inOut(cut) : 1;
			const h = lerp(from.h, b.h, e) * sink;
			b.mesh.scale.set(lerp(PICK_W / 0.66, 1, across), Math.max(0.001, h), lerp(PICK_W / 0.34, 1, smooth(seg(k, 0.5, 1))));
			b.mesh.visible = line > 0 && h > 0.001;
			// Each keeps its name until it lands, where the board's own label takes over.
			const named = line > 0 ? 1 - smooth(seg(k, 0.84, 1)) : 0;
			b.sign.visible = named > 0.001;
			if (b.sign.visible) {
				b.sign.position.set(b.mesh.position.x, b.mesh.position.y + h + 0.46, b.mesh.position.z + 0.3);
				// Smaller once they stand side by side, so neighbouring names never touch.
				b.sign.scale.setScalar(Math.max(0.001, named * lerp(1, 0.78, across)));
			}
			const lit = i === 0 ? smooth(pick) : 0;
			const mat = b.mesh.material as THREE.MeshPhysicalMaterial;
			mat.emissive.set(color.amber);
			mat.emissiveIntensity = lit * 0.9;
			// A kept bar takes on its slice's colour as its share goes across, so each slice can be traced to its bar.
			if (i < SLICE.length) mat.color.set(color.amber).lerp(this.tint.set(SLICE[i]), this.flight(pour, i).sent);
		});
		// A reader who spins before the pour is done gets the whole wheel.
		const whole = this.play !== null || this.extra !== 0;
		const wheelTurn = this.storyAngle + this.extra;
		this.drops.forEach((drop, i) => {
			const { fly, open } = this.flight(pour, i);
			this.face.uFill.value[i] = whole ? 1 : open;
			drop.visible = !whole && fly > 0 && fly < 1;
			if (!drop.visible) return;
			const bar = this.bars[i];
			this.a.copy(bar.mesh.position);
			this.a.y += bar.h + 0.25;
			// Into the middle of its own slice, wherever the wheel has been turned to.
			const odds = this.face.uEdge.value;
			const mid = this.face.uStart.value + (odds[i] + Math.min(odds[i + 1], Math.PI * 2)) / 2;
			const ang = -mid + wheelTurn;
			// Over to a point well in front of its slice, clear of the rim and its pegs, then straight in to the face.
			this.b.set(this.wheel.position.x + Math.cos(ang) * this.wheelR * 0.62, this.wheel.position.y + Math.sin(ang) * this.wheelR * 0.62, this.wheel.position.z + 1.0);
			arcPoint(this.a, this.b, 1.6, inOut(seg(fly, 0, 0.78)), this.c);
			const into = smooth(seg(fly, 0.78, 1));
			this.c.z = lerp(this.c.z, this.wheel.position.z + 0.16, into);
			drop.position.copy(this.c);
			drop.rotation.set(0, 0, -fly * Math.PI * 1.5);
			drop.scale.setScalar(Math.max(0.001, outBack(Math.min(1, fly * 4), 2) * (1 - into * 0.9)));
		});
		this.storyAngle = -outCubic(spin) * SPINS * Math.PI * 2;
		const angle = this.storyAngle + this.extra;
		this.wheel.rotation.z = angle;
		this.wheel.position.z = 0.4;
		// Each peg lifts the flapper as it passes, and lets it snap back. It only reacts as hard as the wheel is moving.
		const moved = angle - this.lastAngle;
		this.lastAngle = angle;
		const phase = (((Math.abs(angle) * PEGS) / (Math.PI * 2)) % 1 + 1) % 1;
		const lift = phase < 0.3 ? phase / 0.3 : (1 - phase) / 0.7;
		const target = Math.min(0.6, Math.abs(moved) * 12) * lift * Math.sign(moved || 1);
		this.flap += (target - this.flap) * 0.5;
		this.flapper.rotation.z = this.flap;
		this.lamp.mix(color.amber, color.green, smooth(pick), spin > 0 && spin < 1 ? 1.2 + Math.sin(time * 12) * 0.6 : 0.4 + pick);

		const c = this.chosen.group;
		c.visible = pick > 0 && ride < 1;
		if (c.visible) {
			// Long and thin in the air, and it squashes where it lands, gathering itself before it rides off.
			const size = outBack(Math.min(1, pick * 1.5), 2);
			const air = bell(pick, 0.2, 0.9);
			const squash = bell(ride, 0, 0.28);
			c.scale.set(size * (1 - air * 0.06 + squash * 0.1), size * (1 + air * 0.2 - squash * 0.28), size * (1 - air * 0.06 + squash * 0.1));
			arcPoint(this.from, this.dock, 0.7, inOut(pick), this.a);
			if (ride > 0) this.a.lerpVectors(this.dock, this.to, inOut(ride));
			c.position.copy(this.a);
		}
	}
}

/* ------------------------------------------------------------------- decode ---- */

const THINKING = ['The', ' user', ' wants', ' the', ' race', ' condition', ' fixed', '.', ' I', ' should', ' search', ' first', '.'];
type Kind = 'think' | 'tool' | 'mark';

class OutTile {
	group = new THREE.Group();
	width: number;
	private face: THREE.Mesh;

	constructor(text: string, kind: Kind) {
		const m = mats();
		const pretty = text.replace(/^ /, '');
		const id = Math.round(100 + hash(text.length * 7.3 + text.charCodeAt(0)) * 39000);
		this.width = Math.max(0.56, Math.min(14, pretty.length) * 0.15 + 0.24);
		const mat =
			kind === 'mark'
				? m.cobalt
				: kind === 'tool'
					? m.amber
					: (thinkMat ??= new THREE.MeshPhysicalMaterial({ color: '#b6c4e2', roughness: 0.38, clearcoat: 0.7 }));
		const body = new THREE.Mesh(sharedRbox(this.width, TILE_H, TILE_D, 0.055, 3), mat);
		body.castShadow = true;
		this.group.add(body);
		const H = 180;
		const W = Math.round((H * this.width) / TILE_D);
		const s = new Surface(W, H);
		s.draw((c, w, h) => {
			const ink = kind === 'mark' ? '#ffffff' : color.ink;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillStyle = ink;
			c.font = `600 62px ${font.mono}`;
			c.fillText(pretty, w / 2, h * 0.42);
			c.globalAlpha = 0.55;
			c.font = `500 28px ${font.mono}`;
			c.fillText(String(id), w / 2, h * 0.8);
			c.globalAlpha = 1;
		});
		this.face = panel(this.width - 0.04, TILE_D - 0.06, s);
		this.face.rotation.x = -Math.PI / 2;
		this.face.position.y = TILE_H / 2 + 0.002;
		this.group.add(this.face);
	}
}
let thinkMat: THREE.MeshPhysicalMaterial | undefined;

const THINK_A = 16.06;
const THINK_B = 16.9;
/** The belt's back rail, behind its centre, and how high above it the note on the thinking stands. */
const THINK_RAIL = 0.62;
const THINK_UP = 0.66;
/** How far along the rail it rolls in from, which is off the left of every screen. */
const THINK_ROLL = 26;
const CALL_A = 17.06;
const CALL_B = 17.72;

class Decoder {
	group = new THREE.Group();
	private think: OutTile[] = THINKING.map((t) => new OutTile(t, 'think'));
	private rows: Record<HarnessId, OutTile[]>;
	private row: OutTile[] = [];
	private xs: number[] = [];
	/** Where each tile sits on the rail before the belt carries the row away, in reading order. */
	get places(): readonly number[] {
		return this.xs;
	}
	/** How many of the tiles are the tool call, after the thinking. */
	get callLength() {
		return this.row.length - THINKING.length;
	}
	private rider: THREE.Mesh;
	private bead: THREE.Mesh;
	private plates: MapPlate[] = [];
	private kvRows: KvRow[] = [];
	private kvKey = '';
	private fans: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[] = [];
	private path: THREE.CatmullRomCurve3;
	private thread: THREE.Mesh;
	private thinkSign: THREE.Group;
	private stops: Lamp[] = [];
	private ticket = new THREE.Group();
	private paper = new Card(4.6, 2.5, 330, 0.02);
	private stamp: THREE.Mesh;
	private spark: THREE.Mesh;
	private call: HarnessId = 'claude';
	private written = -1;
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();
	private port: THREE.Vector3;
	private portIn: THREE.Vector3;

	constructor() {
		const m = mats();
		const stack = new THREE.Group();
		stack.position.set(STACK_X, 0, BACK_Z);
		this.group.add(stack);
		const spot = (f: number) => new THREE.Vector3(SPOTS[f][0] * SCALE, FLOOR_Y[f] + 0.03, SPOTS[f][1] * SCALE);

		FLOOR_Y.forEach((y, f) => {
			const plate = new MapPlate(MAP_W * SCALE, MAP_D * SCALE, 0.2);
			plate.group.position.y = y;
			stack.add(plate.group);
			this.plates.push(plate);
			const row = new KvRow(MAX_PAIRS, -2.6, 3.9, 0.075);
			row.group.position.set(0, y - 0.1, (MAP_D * SCALE) / 2 + 0.01);
			stack.add(row.group);
			this.kvRows.push(row);
			const sign = createSign(['Embedding', 'Layer 1', 'Layer 2', 'Layer 80'][f], 0.17);
			sign.position.set((-MAP_W * SCALE) / 2 + 0.72, y - 0.1, (MAP_D * SCALE) / 2 + 0.04);
			stack.add(sign);
		});
		const kvSign = createSign('KV cache: one key and one value more each step', 0.18);
		// Its top edge is set into the map's front lip, just under the lights it explains.
		kvSign.position.set(0.6, FLOOR_Y[0] - 0.33 - grown(0.18), (MAP_D * SCALE) / 2 + 0.025);
		stack.add(kvSign);
		const under = contactShadow(MAP_W * SCALE + 1, MAP_D * SCALE + 1, 0.5, 0.5, '#020818');
		under.position.y = 0.32;
		stack.add(under);

		// What is already there: the prompt, with its threads, finished and not recomputed.
		const pinGeo = rbox(0.42, 0.1, 0.3, 0.03, 2);
		const pinMat = new THREE.MeshStandardMaterial({ color: '#ffd98a', roughness: 0.4, emissive: '#d88a1a', emissiveIntensity: 0.35 });
		const pins = new THREE.InstancedMesh(pinGeo, pinMat, TOKEN_PATHS[0].length * FLOOR_Y.length);
		pins.frustumCulled = false;
		const threadMat = new THREE.MeshStandardMaterial({ color: '#ffd98a', roughness: 0.4, emissive: '#c07a10', emissiveIntensity: 0.25 });
		const placed = new THREE.Object3D();
		const LEVELS = [1, 3, 4, 6];
		TOKEN_PATHS[0].forEach((_, i) => {
			const points: THREE.Vector3[] = [];
			LEVELS.forEach((level, f) => {
				const [x, z] = TOKEN_PATHS[level][i];
				const p = new THREE.Vector3(x * SCALE, FLOOR_Y[f] + 0.04, z * SCALE);
				placed.position.copy(p);
				placed.position.y += 0.05;
				placed.updateMatrix();
				pins.setMatrixAt(i * FLOOR_Y.length + f, placed.matrix);
				if (f > 0) {
					const prev = points[points.length - 1];
					const h = (p.y - prev.y) * 0.5;
					const c = new THREE.CubicBezierCurve3(prev.clone(), prev.clone().setY(prev.y + h), p.clone().setY(p.y - h), p.clone());
					points.push(...c.getPoints(10).slice(1));
				} else points.push(p);
			});
			stack.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 44, 0.018, 5), threadMat));
		});
		stack.add(pins);

		// The new token's own path, drawn as it climbs.
		const pts: THREE.Vector3[] = [];
		FLOOR_Y.forEach((_, f) => {
			const p = spot(f);
			if (f > 0) {
				const prev = pts[pts.length - 1];
				const h = (p.y - prev.y) * 0.5;
				const c = new THREE.CubicBezierCurve3(prev.clone(), prev.clone().setY(prev.y + h), p.clone().setY(p.y - h), p.clone());
				pts.push(...c.getPoints(12).slice(1));
			} else pts.push(p);
		});
		this.path = new THREE.CatmullRomCurve3(pts);
		this.path.arcLengthDivisions = 300;
		this.thread = new THREE.Mesh(new THREE.TubeGeometry(this.path, 90, 0.04, 7), new THREE.MeshStandardMaterial({ color: '#ffb31a', emissive: '#ff8a00', emissiveIntensity: 1, roughness: 0.35 }));
		this.thread.frustumCulled = false;
		stack.add(this.thread);

		// On every floor it looks back at all of them, in one flash.
		FLOOR_Y.forEach((y, f) => {
			const from = spot(f);
			from.y += 0.16;
			const parts: THREE.BufferGeometry[] = [];
			TOKEN_PATHS[0].forEach((_, i) => {
				const [x, z] = TOKEN_PATHS[LEVELS[f]][i];
				const to = new THREE.Vector3(x * SCALE, y + 0.14, z * SCALE);
				const c = from.clone().lerp(to, 0.5);
				c.y += 0.25 + from.distanceTo(to) * 0.16;
				parts.push(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(from, c, to), 14, 0.012 + hash(i * 3.1 + f) * 0.016, 5));
			});
			const mat = new THREE.MeshBasicMaterial({ color: '#ff9a2e', transparent: true, opacity: 0, depthWrite: false });
			const mesh = new THREE.Mesh(mergeGeometries(parts), mat);
			mesh.visible = false;
			mesh.renderOrder = 2;
			stack.add(mesh);
			this.fans.push({ mesh, mat });
		});

		this.bead = new THREE.Mesh(rbox(0.5, 0.16, 0.36, 0.04, 2), m.amber);
		this.bead.castShadow = true;
		this.bead.visible = false;
		stack.add(this.bead);
		this.portIn = spot(0).add(stack.position);
		this.port = spot(3).add(stack.position);

		this.rider = new THREE.Mesh(rbox(0.7, TILE_H, TILE_D, 0.055, 3), m.amber);
		this.rider.castShadow = true;
		this.group.add(this.rider);

		this.think.forEach((t) => this.group.add(t.group));
		this.rows = {
			claude: this.buildCall('claude'),
			codex: this.buildCall('codex'),
			copilot: this.buildCall('copilot')
		};

		// The note on the thinking rides the belt's back rail on two clamps, like the tokenizer's gantry rides its own.
		this.thinkSign = new THREE.Group();
		const note = createSign('Thinking: billed as output, kept private', 0.22);
		note.rotation.x = -0.6;
		note.position.set(0, THINK_UP, 0.05);
		this.thinkSign.add(note);
		const plate = note.children[0].children[0] as THREE.Mesh;
		plate.geometry.computeBoundingBox();
		const noteW = plate.geometry.boundingBox!.max.x - plate.geometry.boundingBox!.min.x;
		const clamp = new Batch();
		for (const x of [-noteW * 0.3, noteW * 0.3]) {
			// The shoe wraps the rail, and the post runs from it into the back of the plate.
			clamp.add(rbox(0.24, 0.1, 0.12, 0.03, 2), m.steel, { p: [x, -0.005, 0] });
			clamp.add(rbox(0.09, THINK_UP - 0.01, 0.06, 0.02, 2), m.steelSoft, { p: [x, 0.035 + (THINK_UP - 0.01) / 2, 0] });
		}
		this.thinkSign.add(clamp.build('sign-post'));
		this.group.add(this.thinkSign);
		const subPad = createPad(13.4, 3);
		subPad.position.set(DEC + 6.7, PAD_Y, 3.4);
		this.group.add(subPad);

		// The ticket: what those tokens amount to, coming up out of a slot one token at a time.
		const slot = new Batch();
		slot.add(rbox(5.1, 0.14, 0.74, 0.05, 3), m.steelSoft, { p: [0, 0.07, 0] });
		slot.add(rbox(4.86, 0.02, 0.1, 0.01, 1), m.recess, { p: [0, 0.145, 0] });
		const printer = slot.build('ticket-slot');
		printer.position.set(DEC + 3.4, PAD_Y, 3.7);
		this.group.add(printer);
		this.ticket.position.set(DEC + 3.4, PAD_Y + 0.14, 3.7);
		this.ticket.rotation.x = -0.3;
		this.ticket.add(this.paper.mesh);
		this.group.add(this.ticket);
		const ink = new Surface(640, 150);
		ink.draw((c, w, h) => {
			c.strokeStyle = '#c8321f';
			c.lineWidth = 9;
			c.beginPath();
			c.roundRect(8, 8, w - 16, h - 16, 22);
			c.stroke();
			c.fillStyle = '#c8321f';
			c.font = `800 54px ${font.display}`;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.fillText('Valid, not yet allowed', w / 2, h / 2 + 3);
		});
		this.stamp = panel(2.28, 0.54, ink);
		this.stamp.position.set(0.98, -0.8, 0.04);
		this.stamp.rotation.z = 0.09;
		this.paper.mesh.add(this.stamp);
		// What carries each token from the rail to the paper.
		this.spark = new THREE.Mesh(rbox(0.26, 0.1, 0.18, 0.03, 2), m.amber);
		this.spark.castShadow = true;
		this.group.add(this.spark);

		// Why generation stopped, and what the harness does about it.
		const panelBox = new Batch();
		panelBox.add(rbox(5.7, 2.3, 0.3, 0.1, 3), m.creamLight, { p: [0, 1.25, 0] });
		panelBox.add(rbox(0.4, 0.3, 0.5, 0.05, 2), m.steelSoft, { p: [0, 0.15, 0] });
		const pg = new THREE.Group();
		pg.add(panelBox.build('stops'));
		(
			[
				['end_turn', 'Show the text, wait for you'],
				['tool_use', 'Run the tool, send back the result'],
				['max_tokens', 'Out of room: ask to continue'],
				['refusal', 'A safety check stopped it']
			] as const
		).forEach(([name, meaning], i) => {
			const y = 2 - i * 0.48;
			const l = new Label(name, 0.19, { font: font.mono, weight: 600, align: 'left' });
			l.mesh.position.set(-2.34, y, 0.156);
			pg.add(l.mesh);
			const said = new Label(meaning, 0.16, { color: '#33415c', weight: 600, align: 'left' });
			said.mesh.position.set(-0.56, y, 0.156);
			pg.add(said.mesh);
			const lamp = new Lamp(sharedRbox(0.16, 0.16, 0.04, 0.05, 3), color.green, 0.1);
			lamp.mesh.position.set(-2.56, y, 0.16);
			pg.add(lamp.mesh);
			this.stops.push(lamp);
		});
		// Fitted: any bigger and it would sit over the reasons printed under it.
		const title = createSign('Stop reason', 0.2, undefined, undefined, true);
		title.position.set(0, 2.575, 0.05);
		pg.add(title);
		pg.position.set(DEC + 10, PAD_Y, 3.5);
		pg.rotation.x = -0.3;
		this.group.add(pg);
		this.setHarness('claude');
	}

	private buildCall(id: HarnessId) {
		const list = [new OutTile('<tool>', 'mark'), ...CALLS[id].pieces.map((p) => new OutTile(p, 'tool')), new OutTile('<end>', 'mark')];
		list.forEach((t) => {
			t.group.visible = false;
			this.group.add(t.group);
		});
		return list;
	}

	/** The ticket as far as it has been written: the name, then the arguments, exactly as the tokens spell them. */
	private printTicket(written: number) {
		const key = written;
		if (key === this.written) return;
		this.written = key;
		const pieces = CALLS[this.call].pieces;
		const brace = pieces.indexOf('{"');
		const done = pieces.slice(0, Math.max(0, written));
		const name = done.slice(0, brace).join('');
		const args = done.slice(brace).join('');
		const idName = { claude: 'tool_use_id', codex: 'call_id', copilot: 'call id' }[this.call];
		this.paper.draw((c, w, h) => {
			c.fillStyle = color.amber;
			c.fillRect(0, 0, 22, h);
			c.textBaseline = 'alphabetic';
			const label = (text: string, y: number) => {
				c.fillStyle = '#5a6b85';
				c.font = `600 ${h * 0.07}px ${font.sans}`;
				c.fillText(text, 58, y);
			};
			label('Tool call', h * 0.11);
			label('name', h * 0.25);
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.11}px ${font.mono}`;
			c.fillText(name, 58, h * 0.38);
			label('arguments', h * 0.51);
			c.font = `600 ${h * 0.085}px ${font.mono}`;
			// Broken after a comma or a space where it can be, the way you'd break it by hand.
			const room = Math.floor((w - 96) / c.measureText('m').width);
			let rest = args;
			for (let line = 0; rest; line++) {
				const cut = rest.length <= room ? rest.length : Math.max(rest.lastIndexOf(',', room - 1), rest.lastIndexOf(' ', room - 1)) + 1 || room;
				c.fillText(rest.slice(0, cut), 58, h * 0.63 + line * h * 0.105);
				rest = rest.slice(cut);
			}
			if (written > pieces.length) {
				c.fillStyle = '#5a6b85';
				c.font = `500 ${h * 0.07}px ${font.mono}`;
				c.fillText(`${idName}: ${CALL_IDS.search}`, 58, h * 0.95);
			}
		});
	}

	setHarness(id: HarnessId) {
		this.call = id;
		this.written = -1;
		Object.values(this.rows).forEach((r) => r.forEach((t) => (t.group.visible = false)));
		this.row = [...this.think, ...this.rows[id]];
		let x = ROW0;
		this.xs = this.row.map((t) => {
			const c = x + t.width / 2;
			x += t.width + 0.06;
			return c;
		});
	}

	/** How many tiles exist at T, as a fraction: thinking first, a held breath, then the call. */
	private count(T: number) {
		const nT = THINKING.length;
		const nC = this.row.length - nT;
		return 1 + seg(T, THINK_A, THINK_B) * (nT - 1) + seg(T, CALL_A, CALL_B) * nC;
	}

	update(T: number, shift: number, gate: number, time: number) {
		const n = this.count(T);
		const whole = Math.floor(n);
		const f = n - whole;
		const working = T > THINK_A && (T < THINK_B || (T > CALL_A && T < CALL_B));

		this.row.forEach((tile, i) => {
			const appear = i === 0 ? (T >= 16 ? 1 : 0) : n - i - 0.55;
			const x = this.xs[i] + shift;
			// Into the detokenizer at the row's left end, and gone.
			const past = x < gate;
			tile.group.visible = appear > 0 && !past;
			if (!tile.group.visible) return;
			const k = Math.min(1, appear * 2.3);
			this.a.set(x, RAIL_Y + TILE_H / 2 + 0.002, RAIL_Z);
			if (k < 1) arcPoint(this.port, this.a, 1.4, smooth(k), this.a);
			tile.group.position.copy(this.a);
			tile.group.scale.setScalar(Math.max(0.3, k));
			// Each new token lands on the rail with a little weight.
			const squash = bell(appear, 0.43, 0.8);
			if (squash > 0) {
				tile.group.scale.set(1 + squash * 0.03, 1 - squash * 0.26, 1 + squash * 0.12);
				tile.group.position.y -= (squash * 0.26 * TILE_H) / 2;
			}
		});

		// The newest token rides back into the stack: its K and V do not exist until the next pass.
		const riding = T < THINK_B && working && f < 0.34 && whole >= 1;
		this.rider.visible = riding;
		if (riding) {
			this.b.set(this.xs[whole - 1], RAIL_Y + TILE_H * 1.12, RAIL_Z);
			// Up in front of the stack, then in over the edge of the first map, between it and the one above.
			const k = smooth(seg(f, 0, 0.34));
			const u = 1 - k;
			const top = this.portIn.y;
			const w1 = 3 * u * u * k;
			const w2 = 3 * u * k * k;
			const w3 = k * k * k;
			this.a.set(
				u * u * u * this.b.x + w1 * lerp(this.b.x, this.portIn.x, 0.3) + w2 * this.portIn.x + w3 * this.portIn.x,
				u * u * u * this.b.y + w1 * (top + 1.25) + w2 * (top + 0.85) + w3 * top,
				u * u * u * this.b.z + w1 * this.b.z + w2 * (this.portIn.z + 0.4) + w3 * this.portIn.z
			);
			this.rider.position.copy(this.a);
			this.rider.position.y += TILE_H / 2;
			this.rider.scale.setScalar(1 - k * 0.3);
			this.rider.rotation.x = Math.sin(k * Math.PI) * 0.45;
		}
		const up = seg(f, 0.3, 0.72);
		this.bead.visible = working && up > 0 && up < 1;
		if (this.bead.visible) {
			this.path.getPointAt(up, this.bead.position);
			this.bead.position.y += 0.08;
			// It draws into its thread to pass each floor, like every other token.
			let wide = 1;
			for (let i = 1; i < FLOOR_Y.length; i++) {
				const y = this.bead.position.y;
				const top = FLOOR_Y[i];
				wide = Math.min(wide, smooth(y < top ? seg(top - 0.2 - y, 0, 0.45) : seg(y - top, 0, 0.1)));
			}
			this.bead.scale.setScalar(0.14 + wide * 0.86);
		}
		this.thread.visible = working && up > 0;
		if (this.thread.visible) this.thread.geometry.setDrawRange(0, Math.floor(up * 90) * 7 * 6);
		const floors = FLOOR_Y.length;
		this.plates.forEach((plate, i) => {
			const arrive = i / (floors - 1);
			const on = working ? bell(up, arrive - 0.2, arrive + 0.2) : 0;
			plate.setLit(0.03 + on * 0.97);
			const fan = this.fans[i];
			fan.mesh.visible = on > 0.02;
			fan.mat.opacity = on * 0.85;
		});

		// One more key and value on each floor, as the token passes it.
		const key = `${whole}/${Math.floor(up * floors)}`;
		if (key !== this.kvKey) {
			this.kvKey = key;
			const prompt = TOKEN_PATHS[0].length;
			this.kvRows.forEach((row, i) => {
				const passed = up * (floors - 1) >= i;
				const made = prompt + whole - 1 + (working && passed ? 1 : 0);
				row.set((p) => (p < made ? 1 : 0));
			});
		}

		const nT = THINKING.length;
		const midThink = (this.xs[0] + this.xs[nT - 1]) / 2 + shift;
		// The note rolls in along the rail from off the left of the picture and stops behind the thinking. When the
		// thinking is done it rolls back out the way it came, as the camera moves on to the call.
		const roll = seg(T, 16.44, 16.64);
		const away = seg(T, 16.93, 17.05);
		this.thinkSign.visible = roll > 0 && away < 1;
		this.thinkSign.position.set(midThink - THINK_ROLL * (1 - outBack(roll, 0.6) + inCubic(away)), RAIL_Y, RAIL_Z - THINK_RAIL);

		// Each token that lands sends a little of itself up to the paper, and the paper comes up a step to take it.
		const nCall = this.row.length - nT;
		const calling = T > CALL_A && T < CALL_B;
		const landed = T >= CALL_B ? nCall : T > CALL_A ? whole - nT : 0;
		const hop = calling && landed > 0 ? seg(f, 0, 0.36) : 0;
		const fed = T >= CALL_B ? nCall : hop >= 1 || !calling ? landed : landed - 1;
		this.spark.visible = hop > 0 && hop < 1;
		if (this.spark.visible) {
			const last = this.row[whole - 1].group.position;
			this.b.set(DEC + 3.4 + (fed / nCall - 0.5) * 3.2, PAD_Y + 0.2, 3.7);
			arcPoint(last, this.b, 0.55, smooth(hop), this.a);
			this.spark.position.copy(this.a);
			this.spark.rotation.y = hop * 5;
		}
		this.ticket.visible = landed > 0 && T < 18.3;
		if (this.ticket.visible) {
			const step = (Math.max(0, fed) + (hop >= 1 ? smooth(seg(f, 0.36, 0.56)) : 0)) / nCall;
			this.paper.mesh.position.y = lerp(-1.02, 1.34, Math.min(1, step));
			this.printTicket(Math.max(0, fed));
		}
		const hit = seg(T, 17.76, 17.81);
		this.stamp.visible = hit > 0;
		if (this.stamp.visible) {
			// Down it comes, flat and hard.
			this.stamp.scale.setScalar(lerp(1.8, 1, outCubic(hit)));
			(this.stamp.material as THREE.MeshStandardMaterial).opacity = Math.min(1, hit * 2.4);
		}

		const stopK = smooth(seg(T, 17.72, 17.8));
		this.stops.forEach((lamp, i) => lamp.set(i === 1 ? color.green : '#54606f', i === 1 ? 0.1 + stopK * 1.1 : 0.03));
		void time;
	}
}

/* -------------------------------------------------------------- detokenizer ---- */

const DET_H = 4.05;
const DET_Z = RAIL_Z - 1.26; // the block's centre, and its tube's
/** The detokenizer's three parts, bottom to top: where its base ends, its glass case starts, and its hood starts. */
const DK = { base: 1.75, case: 1.79, hood: 2.95 };
/** The vocabulary's drum in the case, along x, in front of the tube: how big, and where its axle is. */
const DRUM = { r: 0.42, len: 2.7, y: 2.37, z: 1.4 };
/** Rows round the drum: it turns one row for each tile that goes in. */
const DRUM_ROWS = 12;
/** Where the drum's posts stand, either side of it. */
const POST_X = DRUM.len / 2 + 0.16;
/** The screen in its base's front the text shows on as it streams out: its size, and the height of its middle. */
const READOUT = { w: 2.8, h: 0.38, y: 0.98 };
/** Some of the vocabulary, as a tokenizer has it: a number for each piece of text. The leading dot is a space. */
const VOCAB = [
	'The', '·user', '·wants', '·the', '·race', 'Grep', '("', 'lock', '|', 'schedule', '",', '·src', '/")', '·cat', '·def', '·run',
	'(self', '):', '·while', '·queue', '.pop', '()', '·job', '·fix', '·thread', '·lock', 'I', 'Let', 'First', 'To', 'Sorry', '{',
	'}', '":', '·"', 'ing', 'ed', '·a', '·is', '·of', '·to', '·and', '·in', '·it', '·for', '·with', '·code', '·file',
	'·test', '·bug', '·line', '·read', '·path', 'json', '_id', '·error', '·return', '·self', '·that', '·be', '·on', '·as', '·we', '·now'
];
/** In the order they stream: the thinking first, then the tool call's JSON. */
export const SLIP_TEXT = ['The user', ' wants', ' the race', 'Grep', '("lock', '|schedule', '", src', '/")'];
/** The first three slips are the thinking's text, the rest the tool call's. */
const THINK_SLIPS = 3;
/** How long a tile takes to become paper at the top, and how many trips up the tube a slip makes per unit of T. */
const DETOK_DELAY = 0.012;
const SLIP_RATE = 4.3;
/** The row rides the belt into the detokenizer: how far, and when. */
const BELT_RUN: [number, number] = [18.06, 18.64];
const BELT_SHIFT = -35;
const beltShift = (T: number) => inOut(seg(T, BELT_RUN[0], BELT_RUN[1])) * BELT_SHIFT;
/** The tiles go in at its mouth, and are gone. */
const DET_GATE = DET + 0.2;
/** After this the tube holds still, as the camera rises up it. */
const DETOK_END = 18.98;

/**
 * The drum's face: rows of the vocabulary round it, each entry a token's number and its text. Drawn turned a quarter,
 * so that once wrapped round a drum that lies along x the rows run along it and read left to right.
 */
function vocabulary() {
	const S = 1024;
	const cv = document.createElement('canvas');
	cv.width = cv.height = S;
	const g = cv.getContext('2d')!;
	g.fillStyle = '#fbf3df';
	g.fillRect(0, 0, S, S);
	const row = S / DRUM_ROWS;
	const per = 3;
	g.save();
	g.translate(S, 0);
	g.rotate(Math.PI / 2);
	// Now x runs along the drum (S long) and y round it, rows S / DRUM_ROWS apart.
	for (let r = 0; r < DRUM_ROWS; r++) {
		const y = r * row;
		g.fillStyle = r % 2 ? '#f3e8cc' : '#fbf3df';
		g.fillRect(0, y, S, row);
		g.fillStyle = 'rgba(31,95,224,0.35)';
		g.fillRect(0, y + row - 2, S, 2);
		for (let k = 0; k < per; k++) {
			const i = (r * per + k) % VOCAB.length;
			const x = (k * S) / per + 18;
			g.textBaseline = 'middle';
			g.fillStyle = '#1f5fe0';
			g.font = `600 ${Math.round(row * 0.34)}px ${font.mono}`;
			g.fillText(String(200 + Math.floor(hash(i * 13.7) * 99000)), x, y + row * 0.52);
			g.fillStyle = color.ink;
			g.font = `600 ${Math.round(row * 0.5)}px ${font.mono}`;
			g.fillText(VOCAB[i], x + row * 1.85, y + row * 0.52);
			g.fillStyle = 'rgba(16,26,48,0.18)';
			if (k) g.fillRect((k * S) / per - 1, y + 6, 2, row - 12);
		}
	}
	g.restore();
	const t = new THREE.CanvasTexture(cv);
	t.colorSpace = THREE.SRGBColorSpace;
	t.anisotropy = 4;
	return t;
}

class Detokenizer {
	group = new THREE.Group();
	private slips: THREE.Mesh[] = [];
	/** When each slip sets off up the tube: only once the tiles it is made from have gone in. */
	private launch: number[] = SLIP_TEXT.map(() => Infinity);
	/** When the first tile goes in, and the lamp turns green. */
	private firstIn = Infinity;
	private lamp: Lamp;
	private TOP = PAD_Y + DET_H + 0.3;
	private drum = new THREE.Group();
	private rotors: THREE.Object3D[] = [];
	/** When each tile goes in: the drum turns a row for each. */
	private entries: number[] = [];
	private readout: Surface;
	/** How many slips the screen shows the text of. */
	private shown = -1;

	constructor() {
		const m = mats();
		this.group.position.x = DET;
		const pad = createPad(10, 10);
		pad.position.set(0, PAD_Y, 2.4);
		this.group.add(pad);

		// Three parts one over another, as the pools are: a cream base the belt runs into, a glass case with the
		// vocabulary in it on a drum, and a cobalt hood the tube home rises out of. Nothing but paper comes out of the top.
		const W = 3.6;
		const H = DET_H;
		// A tunnel wide enough for the broadest tile, special tokens included, with the same wall in front of it.
		const D = 4.8;
		const c = craft();
		const body = new THREE.Group();
		body.position.set(0, PAD_Y, DET_Z);
		this.group.add(body);
		shadowOn(this.group, 0, PAD_Y, DET_Z, W + 0.2, D + 0.2, 0.34);
		const b = new Batch();
		archInto(b, { w: W, d: D, h: DK.base, archZ: RAIL_Z - DET_Z, archD: 1.8, archH: 1.4, plugX: -0.9 });
		b.add(rbox(W + 0.06, 0.06, D + 0.06, 0.02, 1), c.chrome, { p: [0, DK.base - 0.01, 0] });
		guards(b, W, D / 2, 0.24, DK.base - 0.12, 0.06);
		// A chrome kick plate along its foot, and a seam either side where its front panel meets its sides.
		b.add(rbox(W + 0.04, 0.1, D + 0.04, 0.03, 2), c.chrome, { p: [0, 0.2, 0] });
		for (const s of [-1, 1]) b.add(rbox(0.03, DK.base - 0.5, 0.03, 0.01, 1), m.recess, { p: [s * (W / 2 - 0.22), (DK.base + 0.3) / 2, D / 2 + 0.005] });
		louvre(b, -1, [-W / 2 - 0.005, 1.0, -1.1], 0.9, 1.8, 6);
		// The case: dark behind and below, a board on its back wall, a strip of light along its top, chrome on every edge.
		const cw = W - 0.2;
		const cy = (DK.case + DK.hood) / 2;
		const ch = DK.hood - DK.case;
		const front = D / 2 - 0.05;
		const back = -0.7;
		const cd = front - back;
		const cz = (front + back) / 2;
		b.add(rbox(W, ch, D / 2 + back, 0.04, 2), m.cream, { p: [0, cy, (back - D / 2) / 2] });
		b.add(rbox(cw, ch, 0.06, 0.02, 1), m.recess, { p: [0, cy, back + 0.03] });
		b.add(new THREE.PlaneGeometry(cw - 0.3, ch - 0.16), c.board, { p: [0, cy, back + 0.065] });
		b.add(rbox(cw, 0.04, cd, 0.01, 1), m.recess, { p: [0, DK.case + 0.02, cz] });
		b.add(rbox(cw - 0.3, 0.04, 0.06, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#d6e8ff' }), { p: [0, DK.hood - 0.06, front - 0.12] });
		const bar = 0.07;
		for (const x of [-cw / 2, cw / 2]) for (const z of [front, back]) b.add(rbox(bar, ch + bar, bar, 0.02, 1), c.chrome, { p: [x, cy, z] });
		for (const y of [DK.case, DK.hood]) {
			for (const z of [front, back]) b.add(rbox(cw + bar, bar, bar, 0.02, 1), c.chrome, { p: [0, y, z] });
			for (const x of [-cw / 2, cw / 2]) b.add(rbox(bar, bar, cd, 0.02, 1), c.chrome, { p: [x, y, cz] });
		}
		// The drum's stand: a gunmetal post at each end and a chrome bearing on each, and a bail across its front
		// where the row being read sits.
		for (const s of [-1, 1]) {
			// The post stops short of the axle; a chrome ring on its top holds the axle's end, which turns inside it.
			b.add(rbox(0.12, DRUM.y - 0.08 - DK.case, 0.2, 0.03, 1), c.gunmetal, { p: [s * POST_X, (DRUM.y - 0.08 + DK.case) / 2, DRUM.z] });
			b.add(new THREE.TorusGeometry(0.075, 0.026, 8, 20).rotateY(Math.PI / 2), c.chrome, { p: [s * (POST_X - 0.06), DRUM.y, DRUM.z] });
			b.add(rbox(0.05, 0.16, DRUM.r + 0.03, 0.02, 1), c.gunmetal, { p: [s * (POST_X + 0.03), DRUM.y - 0.1, DRUM.z + 0.06 + (DRUM.r + 0.03) / 2] });
		}
		b.add(new THREE.CylinderGeometry(0.026, 0.026, 2 * POST_X + 0.06, 10).rotateZ(Math.PI / 2), c.chrome, { p: [0, DRUM.y - 0.17, DRUM.z + DRUM.r + 0.06] });
		// The hood: a chrome lip where it meets the case, beads along its rounded edges, its name in a framed panel, and
		// louvres in its ends.
		b.add(loaf(W, D, H - DK.hood, 0.26), m.cobalt, { p: [0, DK.hood, 0] });
		b.add(rbox(W + 0.06, 0.05, D + 0.06, 0.02, 1), c.chrome, { p: [0, DK.hood + 0.02, 0] });
		loafBeads(b, W, D, H, 0.26);
		bezel(b, 3.3, 0.5, [0, DK.hood + 0.5, D / 2], { t: 0.045, r: 0.1, depth: 0.04 });
		for (const s of [-1, 1] as const) louvre(b, s, [s * (W / 2 + 0.035), DK.hood + 0.5, 0.3], 0.5, 1.8, 5);
		// What cools it, behind the tube on its roof: a pair of fans.
		for (const x of [-0.78, 0.78]) this.rotors.push(fan(b, 0.32, [x, H + 0.14, -1.5]));
		// Coolant up its back corner into the hood, and the fabric's cable out of the floor into its back.
		const ox = W / 2 + 0.16;
		for (const z of [-1.55, -1.9]) pipe(b, [[ox, 0.04, z], [ox, 2.2, z], [ox, DK.hood + 0.2, z], [ox - 0.12, DK.hood + 0.42, z], [ox - 0.17, DK.hood + 0.5, z]], 0.07, c.coolant, 0.8);
		pipe(b, [[-0.6, 0.02, -D / 2 - 1.6], [-0.6, 0.12, -D / 2 - 0.8], [-0.6, 0.9, -D / 2 - 0.2], [-0.6, 1.1, -D / 2 + 0.05]], 0.09, m.orangeGlow, 9);
		// The screen the text shows on, and the lamp over the mouth, each in a chrome bezel.
		bezel(b, READOUT.w, READOUT.h, [0, READOUT.y, D / 2], { t: 0.05, r: 0.06, depth: 0.04 });
		bezel(b, 0.2, 0.2, [W / 2 - 0.36, 1.57, D / 2 + 0.02], { t: 0.035, r: 0.05, depth: 0.03 });
		body.add(b.build('detokenizer'));
		for (const r of this.rotors) body.add(r);
		body.add(pane(cw, ch, [0, cy, front + 0.04], 0.02));
		for (const s of [-1, 1]) {
			const side = pane(cd, ch, [0, 0, 0], 0.02);
			side.position.set(s * (cw / 2 + 0.04), cy, cz);
			side.rotation.y = s * (Math.PI / 2);
			body.add(side);
		}
		// The vocabulary: every token's number and its text, printed round a drum that turns as each tile goes in.
		const drumMat = new THREE.MeshStandardMaterial({ map: vocabulary(), emissive: '#ffffff', emissiveIntensity: 0.22, roughness: 0.5 });
		drumMat.emissiveMap = drumMat.map;
		this.drum.position.set(0, DRUM.y, DRUM.z);
		body.add(this.drum);
		const caps = new Batch();
		caps.add(new THREE.CylinderGeometry(DRUM.r, DRUM.r, DRUM.len, 48, 1).rotateZ(Math.PI / 2), drumMat);
		for (const s of [-1, 1]) caps.add(new THREE.CylinderGeometry(DRUM.r + 0.03, DRUM.r + 0.03, 0.05, 48).rotateZ(Math.PI / 2), c.chrome, { p: [s * (DRUM.len / 2 + 0.02), 0, 0] });
		// Its axle turns with it, its ends in the rings on the posts.
		caps.add(new THREE.CylinderGeometry(0.045, 0.045, 2 * POST_X - 0.06, 12).rotateZ(Math.PI / 2), c.chrome);
		this.drum.add(caps.build('drum'));

		const sign = createSign('Detokenizer: IDs become text', 0.24, undefined, undefined, true);
		sign.position.set(0, PAD_Y + DK.hood + 0.5, DET_Z + D / 2 + 0.06);
		this.group.add(sign);
		const stay = createSign('Token IDs stay here', 0.24, '#ffffff', m.red);
		// On the side the row comes in from. A phone's bigger sign moves out along with its pole, so its near end stays
		// clear of the block's own sign.
		const stayX = W / 2 + 1.9 + grown(signWidth(stay) / SIGN_PHONE / 2);
		stay.position.set(stayX, PAD_Y + 2.2, RAIL_Z - 1.5);
		stay.rotation.y = -0.2;
		const pole = new Batch();
		pole.add(rbox(0.1, 2.2, 0.1, 0.03, 2), m.steelSoft, { p: [stayX, PAD_Y + 1.1, RAIL_Z - 1.56] });
		this.group.add(stay, pole.build('pole'));

		// The text as it comes out, on a screen in its front: the thinking first, then the call's JSON.
		this.readout = new Surface(READOUT.w * 300, READOUT.h * 300);
		this.drawReadout(0);
		const screen = panel(READOUT.w, READOUT.h, this.readout, 1);
		screen.position.set(0, PAD_Y + READOUT.y, DET_Z + D / 2 + 0.012);
		this.group.add(screen);

		// Over the mouth, in a chrome bezel: it turns green once the first tile goes in.
		this.lamp = new Lamp(sharedRbox(0.14, 0.14, 0.04, 0.05, 3), color.amber, 0.3);
		this.lamp.mesh.position.set(W / 2 - 0.36, PAD_Y + 1.57, DET_Z + D / 2 + 0.04);
		this.group.add(this.lamp.mesh);

		// The way out: a glass tube, up through the ceiling and home to your laptop.
		const roof = PAD_Y + H;
		const glass = new THREE.Mesh(
			new THREE.CylinderGeometry(0.72, 0.72, 40, 40, 1, true),
			new THREE.MeshPhysicalMaterial({ color: '#d5ecff', transparent: true, opacity: 0.2, roughness: 0.08, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide })
		);
		glass.position.set(0, roof + 20, DET_Z);
		glass.renderOrder = 4;
		this.group.add(glass);
		const collar = new Batch();
		collar.add(ring(1.02, 0.74, 0.34), m.steel, { p: [0, roof + 0.17, DET_Z] });
		// Its bands stay where the camera rising up the tube passes them, whatever the machine's height.
		collar.add(ring(0.86, 0.74, 0.1), m.steel, { p: [0, PAD_Y + 10, DET_Z] });
		collar.add(ring(0.86, 0.74, 0.1), m.steel, { p: [0, PAD_Y + 16, DET_Z] });
		collar.add(rbox(0.5, 0.05, 0.05, 0.02, 1), m.steelSoft, { p: [0.93, this.TOP + 3.4, DET_Z] });
		this.group.add(collar.build('collar'));
		// A dark throat with a lit rim, so it reads as a way down. Drawn after the glass, which would wash it out to a flat grey disc.
		const throat = new Surface(160, 160);
		throat.draw((c, w, h) => {
			const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
			g.addColorStop(0, '#060f26');
			g.addColorStop(0.66, '#060f26');
			g.addColorStop(0.88, '#14244c');
			g.addColorStop(1, '#3d5589');
			c.fillStyle = g;
			c.fillRect(0, 0, w, h);
		});
		const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.74, 48), new THREE.MeshBasicMaterial({ map: throat.texture, transparent: true }));
		mouth.rotation.x = -Math.PI / 2;
		mouth.position.set(0, roof + 0.012, DET_Z);
		mouth.renderOrder = 5;
		this.group.add(mouth);
		const home = createSign('Back to your laptop', 0.26);
		// Its left end stays at the tube: a phone's bigger sign grows to the right.
		home.position.set(2.32 + grown(signWidth(home) / SIGN_PHONE / 2), this.TOP + 3.4, DET_Z);
		this.group.add(home);

		SLIP_TEXT.forEach((text) => {
			const s = new Surface(420, 170);
			s.draw((c, w, h) => {
				c.fillStyle = color.paper;
				c.fillRect(0, 0, w, h);
				c.fillStyle = color.ink;
				c.textAlign = 'center';
				c.textBaseline = 'middle';
				c.font = `600 62px ${font.mono}`;
				c.fillText(text.trim(), w / 2, h / 2);
			});
			const slip = new THREE.Mesh(
				new THREE.PlaneGeometry(0.96, 0.39),
				new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.7, side: THREE.DoubleSide })
			);
			slip.visible = false;
			this.group.add(slip);
			this.slips.push(slip);
		});
	}

	/**
	 * The times the tiles go into the block, in the order they go, and how many of the first ones are the thinking.
	 * The thinking's text goes up as the thinking's tiles go in, then the call's as the call's do.
	 */
	feed(entries: number[], thinks: number) {
		const calls = entries.length - thinks;
		this.launch = SLIP_TEXT.map((_, i) => {
			const last = i < THINK_SLIPS ? Math.round(((i + 1) / THINK_SLIPS) * thinks) - 1 : thinks + Math.round(((i - THINK_SLIPS + 1) / (SLIP_TEXT.length - THINK_SLIPS)) * calls) - 1;
			const at = entries[Math.max(0, Math.min(entries.length - 1, last))];
			return at === undefined ? Infinity : at + DETOK_DELAY;
		});
		this.firstIn = entries[0] ?? Infinity;
		this.entries = entries;
	}

	/** The screen: the last of the text that has come out, the newest on the right, and a cursor after it. */
	private drawReadout(n: number) {
		this.shown = n;
		const think = SLIP_TEXT.slice(0, Math.min(n, THINK_SLIPS)).join('');
		const call = SLIP_TEXT.slice(THINK_SLIPS, Math.max(THINK_SLIPS, n)).join('');
		this.readout.draw((c, w, h) => {
			c.fillStyle = '#071226';
			c.fillRect(0, 0, w, h);
			c.font = `600 ${h * 0.5}px ${font.mono}`;
			c.textBaseline = 'middle';
			const room = Math.floor((w - 40) / c.measureText('M').width) - 1;
			// The call replaces the thinking on the screen once it starts: it's what the harness will act on.
			const text = call || think;
			const shownText = text.length > room ? '…' + text.slice(text.length - room + 1) : text;
			c.fillStyle = call ? '#ffd27a' : '#bcd4ff';
			c.fillText(shownText, 20, h * 0.52);
			c.fillStyle = '#7cc4ff';
			c.fillRect(24 + c.measureText(shownText).width, h * 0.26, h * 0.26, h * 0.5);
		});
	}

	update(T: number, time: number) {
		const t = Math.min(T, DETOK_END);
		const on = t >= this.firstIn;
		this.lamp.mix(color.amber, color.green, on ? 1 : 0, on ? 1.1 : 0.3);
		// A row a tile, each turn a short snap, as a counter's wheel turns.
		let rows = 0;
		for (const e of this.entries) rows += outCubic(seg(t, e - 0.004, e + 0.004));
		this.drum.rotation.x = -(rows / DRUM_ROWS) * Math.PI * 2;
		const out = this.launch.filter((l) => t >= l).length;
		if (out !== this.shown) this.drawReadout(out);
		for (const r of this.rotors) r.rotation.y = time * 5;
		this.slips.forEach((slip, i) => {
			const since = t - this.launch[i];
			const live = since > 0;
			slip.visible = live;
			if (!live) return;
			const run = (since * SLIP_RATE) % 1;
			// It comes up out of the throat, growing as it comes: it's made there, not pushed up through the roof.
			slip.position.set(Math.sin(i * 2.3 + time) * 0.14, this.TOP + run * 22, DET_Z + Math.cos(i * 1.7) * 0.14);
			slip.scale.setScalar(Math.max(0.001, smooth(seg(run, 0, 0.014))));
			// It flutters, but it never turns its back: the text stays readable.
			slip.rotation.set(Math.sin(run * 8 + i) * 0.3, Math.sin(run * 6 + i * 2) * 0.55, Math.sin(run * 5 + i) * 0.16);
		});
	}
}

/* ------------------------------------------------------------------ chapter ---- */

export class Forward {
	group = new THREE.Group();
	private prefill = new Transformer();
	private sampler = new Sampler();
	private decoder = new Decoder();
	private detok = new Detokenizer();

	constructor() {
		this.group.add(this.prefill.group, this.sampler.group, this.decoder.group, this.detok.group);
	}

	setHarness(id: HarnessId) {
		this.decoder.setHarness(id);
		// When each tile reaches the detokenizer's mouth. The belt only ever moves forward, so a search by halves finds it.
		const entries = this.decoder.places
			.map((x) => {
				if (x + BELT_SHIFT >= DET_GATE) return Infinity;
				let [a, b] = BELT_RUN;
				for (let k = 0; k < 30; k++) {
					const mid = (a + b) / 2;
					if (x + beltShift(mid) < DET_GATE) b = mid;
					else a = mid;
				}
				return b;
			})
			.filter((t) => t < Infinity)
			.sort((a, b) => a - b);
		this.detok.feed(entries, this.decoder.places.length - this.decoder.callLength);
	}

	setTemperature(temperature: number) {
		this.sampler.setTemperature(temperature);
	}

	spinWheel(reduced: boolean, want?: number) {
		return this.sampler.spin(reduced, want);
	}

	get wheelDisc() {
		return this.sampler.wheelDisc;
	}

	update(T: number, time: number) {
		const near = (g: THREE.Object3D, a: number, b: number) => (g.visible = T > a && T < b);
		if (near(this.prefill.group, 13.9, 15.4)) this.prefill.update(T, time);
		if (near(this.sampler.group, 14.7, 16.3)) {
			this.sampler.update(T, seg(T, 15.13, 15.22), seg(T, 15.22, 15.41), seg(T, 15.42, 15.78), seg(T, 15.78, 15.88), seg(T, 15.88, 16), time);
		}
		if (near(this.decoder.group, 15.7, 18.8)) {
			this.decoder.update(T, beltShift(T), DET_GATE, time);
		}
		if (near(this.detok.group, 17.6, 19.2)) this.detok.update(T, time);
	}
}

