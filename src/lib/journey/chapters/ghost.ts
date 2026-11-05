import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { extrude, rbox, roundedRect } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { arcPoint, curve, islandAt, machine, panel, shadowOn, tube } from '../kit/machines';
import { font, Label, Surface } from '../kit/print';
import { createSign } from '../kit/parts';
import { bell, inOut, outBack, seg } from '../kit/math';
import { createCastShadow } from '../props/island';
import type { Shot } from '../rig';

const GP = new THREE.Vector3(80, 34, -4);
const box = (x: number, y: number, w: number, h: number) => ({ x, y, w, h });
const at = (x: number, y: number, z: number): [number, number, number] => [GP.x + x, GP.y + y, GP.z + z];
const TALL = box(0, 0.06, 1, 0.47);
const WIDE = { az: -12, el: 13, target: at(0.3, 3.1, 0), radius: 8.9, ry: 5.2, wide: box(0.37, 0.05, 0.63, 0.92), tall: TALL };

export const GHOST_SHOTS: Shot[] = [
	{ T: 19.06, ...WIDE },
	{ T: 19.9, ...WIDE, az: -9 },
	{ T: 20.06, ...WIDE, az: 12, wide: box(0, 0.05, 0.62, 0.92) },
	{ T: 20.9, ...WIDE, az: 9, wide: box(0, 0.05, 0.62, 0.92) }
];

const TYPED = 'with self._lock:';
const SUGGESTION = 'job = self.queue.pop()';
const SW = 11;
const SH = 6.3;

/** The ghost text path. Same laptop, same model family, a completely different journey. */
export class Ghost {
	group = new THREE.Group();
	private screen = new Surface(1600, Math.round((1600 * SH) / SW));
	private key = '';
	private orb: THREE.Mesh;
	private route: THREE.CatmullRomCurve3;
	private keycap = new THREE.Group();
	private tab = new THREE.Group();
	private lamps: Lamp[] = [];
	private hand = new THREE.Group();
	private slips: THREE.Mesh[] = [];
	private counted: THREE.InstancedMesh;
	private d = new THREE.Object3D();
	private a = new THREE.Vector3();
	private b = new THREE.Vector3();

	constructor() {
		const m = mats();
		this.group.position.copy(GP);
		this.group.add(islandAt(25, 13));
		const shade = createCastShadow(24, 12, 0.18);
		shade.position.set(0, -9, 0);
		this.group.add(shade);

		// The editor, big enough to be the landscape.
		const b = new Batch();
		b.add(extrude(roundedRect(SW + 0.42, SH + 0.42, 0.26), 0.3, 0.07, 4, 10), m.steel, { p: [0, 4.1, -3.2] });
		b.add(rbox(1, 1.1, 0.5, 0.1, 3), m.steelSoft, { p: [0, 0.5, -3.3] });
		b.add(rbox(4, 0.14, 1.8, 0.06, 3), m.steelSoft, { p: [0, 0.07, -3.2] });
		this.group.add(b.build('monitor'));
		const face = panel(SW, SH, this.screen, 1);
		face.position.set(0, 4.1, -3.04);
		this.group.add(face);
		shadowOn(this.group, 0, 0, -3.2, 4.2, 2, 0.4);

		// The route the request takes, through four small machines in a line.
		const stops: [string, number, 'cream' | 'cobalt'][] = [
			['Cache', -5.4, 'cream'],
			['Build prompt', -1.4, 'cream'],
			['copilot-proxy', 2.8, 'cobalt'],
			['Filter', 6.8, 'cream']
		];
		stops.forEach(([name, x, finish]) => {
			const mc = machine({ w: 3, h: 1.9, d: 1.5, finish, name, signH: 0.24, vent: false });
			mc.position.set(x, 0, 2.2);
			this.group.add(mc);
			shadowOn(this.group, x, 0, 2.2, 3.3, 1.8);
			const lamp = new Lamp(rbox(0.12, 0.12, 0.03, 0.04, 2), color.amber, 0.2);
			lamp.mesh.position.set(x + 1.2, 0.5, 2.97);
			this.group.add(lamp.mesh);
			this.lamps.push(lamp);
		});
		this.route = curve([
			[-8.6, 0.42, 3.4],
			[-7.2, 0.5, 3.4],
			[-5.4, 0.5, 3.15],
			[-1.4, 0.5, 3.15],
			[2.8, 0.5, 3.15],
			[6.8, 0.5, 3.15],
			[8.9, 0.8, 2.6],
			[9, 3.4, -1.6],
			[5.6, 4.6, -2.9]
		]);
		this.group.add(tube(this.route, 0.07, m.orangeGlow, 140));
		this.orb = new THREE.Mesh(
			new THREE.SphereGeometry(0.2, 16, 12),
			new THREE.MeshStandardMaterial({ color: '#fff0c8', emissive: color.amber, emissiveIntensity: 3 })
		);
		this.group.add(this.orb);

		// The keys, because this starts with your finger.
		const cap = (text: string, w: number, group: THREE.Group, x: number, z: number) => {
			const kb = new Batch();
			kb.add(extrude(roundedRect(w, 1.1, 0.18), 0.34, 0.09, 4, 10), m.creamLight, { r: [-Math.PI / 2, 0, 0] });
			group.add(kb.build('key'));
			const l = new Label(text, 0.42, { weight: 700, font: font.mono });
			l.mesh.rotation.x = -Math.PI / 2;
			l.mesh.position.y = 0.178;
			group.add(l.mesh);
			group.position.set(x, 0.17, z);
			this.group.add(group);
		};
		const well = new Batch();
		well.add(rbox(4.2, 0.1, 1.6, 0.05, 3), m.recess, { p: [-9.2, 0.05, 4.2] });
		this.group.add(well.build('well'));
		cap(':', 1.1, this.keycap, -10.2, 4.2);
		cap('Tab', 1.9, this.tab, -8.3, 4.2);

		// The stopwatch with its budget marked: the whole trip has to fit inside it.
		const R = 1.42;
		const dial = new Surface(600, 600);
		dial.draw((c, w, h) => {
			const cx = w / 2;
			const cy = h / 2;
			c.fillStyle = '#fffaf0';
			c.beginPath();
			c.arc(cx, cy, cx, 0, Math.PI * 2);
			c.fill();
			const ang = (ms: number) => -Math.PI / 2 + (ms / 400) * Math.PI * 2;
			c.strokeStyle = '#22d36b';
			c.lineWidth = 46;
			c.beginPath();
			c.arc(cx, cy, cx - 60, ang(0), ang(200));
			c.stroke();
			c.strokeStyle = '#ffbc12';
			c.beginPath();
			c.arc(cx, cy, cx - 60, ang(200), ang(300));
			c.stroke();
			c.strokeStyle = '#f0473c';
			c.beginPath();
			c.arc(cx, cy, cx - 60, ang(300), ang(400));
			c.stroke();
			c.fillStyle = color.ink;
			c.textAlign = 'center';
			c.textBaseline = 'middle';
			c.font = `700 44px ${font.mono}`;
			[100, 200, 300].forEach((ms) => {
				const a = ang(ms);
				c.fillText(String(ms), cx + Math.cos(a) * (cx - 148), cy + Math.sin(a) * (cx - 148));
			});
			c.font = `700 48px ${font.sans}`;
			c.fillText('ms', cx, cy + 112);
		});
		const watch = new THREE.Group();
		const wb = new Batch();
		wb.add(new THREE.CylinderGeometry(R + 0.12, R + 0.12, 0.3, 64), m.steel, { r: [Math.PI / 2, 0, 0] });
		wb.add(new THREE.CylinderGeometry(0.16, 0.16, 0.3, 16), m.steel, { p: [0, R + 0.28, 0] });
		wb.add(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 20), m.steelSoft, { p: [0, R + 0.46, 0] });
		watch.add(wb.build('watch'));
		const dialFace = new THREE.Mesh(new THREE.CircleGeometry(R, 64), new THREE.MeshStandardMaterial({ map: dial.texture, roughness: 0.5 }));
		dialFace.position.z = 0.156;
		watch.add(dialFace);
		const hb = new Batch();
		hb.add(rbox(0.07, R * 0.86, 0.03, 0.01, 1), m.red, { p: [0, R * 0.38, 0] });
		hb.add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 16), m.red, { r: [Math.PI / 2, 0, 0] });
		this.hand.add(hb.build('hand'));
		this.hand.position.z = 0.19;
		watch.add(this.hand);
		watch.position.set(7.9, 2.05 + 1, -0.8);
		watch.rotation.y = -0.25;
		this.group.add(watch);
		const legs = new Batch();
		legs.add(rbox(1.5, 0.12, 0.9, 0.05, 2), m.steelSoft, { p: [7.9, 0.06, -0.8] });
		legs.add(rbox(0.16, 1.7, 0.16, 0.04, 2), m.steelSoft, { p: [7.9, 0.85, -0.8] });
		this.group.add(legs.build('watch-stand'));

		// Prefix and suffix: two strings, nothing more, leave the editor.
		for (const [text, tone] of [
			['prefix', '#1f5fe0'],
			['suffix', '#0f8a4a']
		]) {
			const s = new Surface(380, 150);
			s.draw((c, w, h) => {
				c.fillStyle = '#fffaf0';
				c.fillRect(0, 0, w, h);
				c.fillStyle = tone;
				c.fillRect(0, 0, 18, h);
				c.fillStyle = color.ink;
				c.font = `600 66px ${font.mono}`;
				c.textBaseline = 'middle';
				c.fillText(text, 52, h / 2 + 4);
			});
			const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.6), new THREE.MeshStandardMaterial({ map: s.texture, roughness: 0.7, side: THREE.DoubleSide }));
			mesh.castShadow = true;
			mesh.visible = false;
			this.group.add(mesh);
			this.slips.push(mesh);
		}

		// The tokens it counts locally, and then throws away.
		this.counted = new THREE.InstancedMesh(rbox(0.26, 0.1, 0.26, 0.03, 2), m.amber, 24);
		this.counted.frustumCulled = false;
		this.group.add(this.counted);
		const note = createSign('Counts tokens here, sends only text', 0.2);
		note.position.set(-1.4, 2.72, 1.8);
		note.rotation.x = -0.2;
		this.group.add(note);
	}

	private drawScreen(typed: number, ghost: number, accepted: boolean, bands: number, cursor: boolean) {
		const key = `${typed}/${ghost}/${accepted}/${Math.round(bands * 10)}/${cursor}`;
		if (key === this.key) return;
		this.key = key;
		this.screen.draw((c, w, h) => {
			c.fillStyle = '#10203f';
			c.fillRect(0, 0, w, h);
			c.fillStyle = '#17294f';
			c.fillRect(0, 0, w, 64);
			['#ff6159', '#ffbd2e', '#28c941'].forEach((col, i) => {
				c.fillStyle = col;
				c.beginPath();
				c.arc(36 + i * 34, 32, 11, 0, Math.PI * 2);
				c.fill();
			});
			c.fillStyle = '#a9bde0';
			c.font = `500 28px ${font.mono}`;
			c.textBaseline = 'middle';
			c.fillText('scheduler.py', 170, 33);
			const L = 74;
			const size = 48;
			const y0 = 136;
			const x0 = 96;
			c.font = `500 ${size}px ${font.mono}`;
			const lines = ['class JobScheduler:', '    def run(self):', '        while self.queue:'];
			const line = (i: number) => y0 + i * L;
			// Prefix and suffix, shown as what they are: everything before and after the cursor.
			if (bands > 0) {
				c.globalAlpha = bands * 0.24;
				c.fillStyle = '#3f8bff';
				c.fillRect(0, line(0) - L / 2, w, L * 4);
				c.fillStyle = '#2fd17d';
				c.fillRect(0, line(5) - L / 2, w, L);
				c.globalAlpha = bands;
				c.font = `700 30px ${font.sans}`;
				c.textAlign = 'right';
				c.fillStyle = '#9fc5ff';
				c.fillText('prefix', w - 40, line(0));
				c.fillStyle = '#8bf0b8';
				c.fillText('suffix', w - 40, line(5));
				c.globalAlpha = 1;
				c.textAlign = 'left';
				c.font = `500 ${size}px ${font.mono}`;
			}
			lines.forEach((t, i) => {
				c.fillStyle = '#e6edf8';
				c.fillText(t, x0, line(i));
			});
			const now = `            ${TYPED.slice(0, typed)}`;
			c.fillStyle = '#ffffff';
			c.fillText(now, x0, line(3));
			const indent = c.measureText('                ').width;
			if (ghost > 0) {
				c.fillStyle = accepted ? '#ffffff' : 'rgba(190,205,235,.56)';
				c.font = `${accepted ? 500 : 'italic 500'} ${size}px ${font.mono}`;
				c.fillText(SUGGESTION.slice(0, ghost), x0 + indent, line(4));
				c.font = `500 ${size}px ${font.mono}`;
			}
			if (cursor) {
				c.fillStyle = '#ffc53d';
				const at = typed < TYPED.length ? x0 + c.measureText(now).width + 3 : x0 + indent + (accepted ? c.measureText(SUGGESTION).width : 0) - 3;
				c.fillRect(at, (typed < TYPED.length ? line(3) : line(4)) - 28, 6, 56);
			}
			c.fillStyle = '#e6edf8';
			c.fillText('            self._dispatch(job)', x0, line(5));
		});
	}

	update(T: number, time: number) {
		const typed = Math.floor(seg(T, 19.06, 19.26) * TYPED.length);
		const ghost = Math.floor(seg(T, 20.42, 20.58) * SUGGESTION.length);
		const accepted = T > 20.72;
		const bands = seg(T, 19.3, 19.38) * (1 - seg(T, 20.0, 20.06));
		this.drawScreen(typed, ghost, accepted, bands, Math.floor(time * 2) % 2 === 0);

		const press = bell(seg(T, 19.06, 19.26) * TYPED.length % 1, 0, 1) * (T > 19.06 && T < 19.26 ? 1 : 0);
		this.keycap.position.y = 0.17 - press * 0.07;
		this.tab.position.y = 0.17 - bell(T, 20.66, 20.74) * 0.09;

		// Keystroke to cache, cache to prompt, prompt out to the proxy, proxy home.
		const legs: [number, number, number, number][] = [
			[19.26, 19.38, 0, 0.16],
			[19.72, 19.86, 0.16, 0.36],
			[20.06, 20.2, 0.36, 0.56],
			[20.2, 20.3, 0.56, 0.68],
			[20.3, 20.42, 0.68, 1]
		];
		let u = -1;
		for (const [a, b, from, to] of legs) if (T >= a && T <= b) u = from + (to - from) * inOut(seg(T, a, b));
		this.orb.visible = u >= 0;
		if (u >= 0) this.orb.position.copy(this.route.getPointAt(u));

		const lit = [19.36, 19.84, 20.18, 20.3];
		this.lamps.forEach((l, i) => {
			const on = T > lit[i];
			if (i === 0) l.set(on ? color.red : color.amber, on ? 0.9 : 0.15);
			else l.mix(color.amber, color.green, on ? 1 : 0, on ? 0.8 : 0.15);
		});

		this.slips.forEach((slip, i) => {
			const k = seg(T, 19.38 + i * 0.03, 19.56 + i * 0.03);
			slip.visible = k > 0 && T < 20.06;
			if (!slip.visible) return;
			this.a.set(-3.4 + i * 3, 4.6 - i * 1.6, -2.9);
			this.b.set(-1.4 - 0.82 + i * 1.64, 2.25, 2.5);
			arcPoint(this.a, this.b, 0.7, inOut(k), this.a);
			slip.position.copy(this.a);
			slip.rotation.set(-0.3 * (1 - k), 0, (i ? -1 : 1) * 0.06);
		});

		const d = this.d;
		const burst = seg(T, 19.56, 19.68);
		const drop = seg(T, 19.68, 19.78);
		for (let i = 0; i < this.counted.count; i++) {
			const col = i % 6;
			const row = Math.floor(i / 6);
			const s = outBack(seg(burst, i / 28, i / 28 + 0.22), 2) * (1 - drop);
			d.position.set(-1.4 - 0.85 + col * 0.34, 2.04 + 0.02 + drop * -0.5 + row * 0.02, 1.9 + (row - 1.5) * 0.3);
			d.scale.setScalar(Math.max(0.0001, s));
			d.updateMatrix();
			this.counted.setMatrixAt(i, d.matrix);
		}
		this.counted.instanceMatrix.needsUpdate = true;

		const ms = seg(T, 19.26, 20.46) * 165;
		this.hand.rotation.z = -(ms / 400) * Math.PI * 2;
	}
}
