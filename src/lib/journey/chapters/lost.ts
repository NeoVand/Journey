import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox, sharedRbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { Card, panel, shadowOn } from '../kit/machines';
import { font, Surface } from '../kit/print';
import { createSign, grown } from '../kit/parts';
import { craft } from '../kit/craft';
import { bell, inOut, lerp, outBack, outCubic, seg, smooth } from '../kit/math';
import { palette } from '../sky/palette';

/*
 * When the answer gets lost, on one island. The file stands on a brass lectern, and a glass tube rises from it to the
 * model. The edit comes down the tube and the line changes; its receipt sets off back up, the tube snaps, and the
 * receipt tumbles out into a cloud: did it happen? A loupe on a jointed arm leans over the page and looks. It did.
 * Then the same edit comes again, as a careless retry would, and bounces off: the old text it was looking for is gone,
 * so it finds nothing to change. In front, your console: four controls, and above each what it acts on. The wheel
 * steers the plan; the red button stops the stream of words; the key, under its cover, kills the running process; the
 * dial rolls the file back. Only the last undoes a change. Each can be pressed. Drawn from concepts/lost-r1.
 */

/** The page, on its lectern: where it stands, its size, and how far it leans back. */
const PAGE = { x: 0, y: 1.32, z: -1.6, w: 2.6, h: 3.0, lean: 0.16 };
/** The changed line on the page, in its own fraction from the top. */
const LINE_V = 0.4;
/** The tube up to the model: its radius, its foot over the page, and where it snaps. */
const TUBE = { r: 0.22, x: 0, z: -1.95, foot: 4.62, top: 9.4, snap: 5.3, gap: 0.62 };
const CLOUD = { x: 2.6, y: 5.0, z: -1.9 };
/** The loupe's arm: its shoulder on the post, its two lengths, the lens's radius, and where the lens rests and looks. */
const ARM = {
	shoulder: new THREE.Vector3(-2.7, 2.48, -0.9),
	upper: 1.3,
	fore: 1.25,
	ring: 0.4,
	rest: new THREE.Vector3(-1.75, 3.55, -0.55),
	look: new THREE.Vector3(0.15, PAGE.y + 0.05 + PAGE.h * (1 - LINE_V), -1.2)
};
const CONSOLE = { z: 2.5, y: 0.62, w: 10.4, d: 1.7 };
const SLOTS = [-3.75, -1.25, 1.25, 3.75];
export const CONTROLS = ['Steer', 'Cancel', 'Terminate', 'Roll back'];
const WHAT = ['change the plan', 'stop the stream', 'kill the process', 'undo the file change'];
export const CONTROL_TIPS = CONTROLS.map((c, i) => `${c}: ${WHAT[i]}`);

/** The story's moments, in T. */
const AT = {
	down: [28.08, 28.14],
	applied: [28.135, 28.16],
	up: [28.16, 28.215],
	snap: [28.21, 28.235],
	tumble: [28.215, 28.29],
	doubt: [28.23, 28.3],
	look: [28.3, 28.42],
	verdict: [28.44, 28.5],
	retry: [28.5, 28.6],
	doubtGone: [28.54, 28.6],
	controls: 28.62
} as const;

/** The file: scheduler.py, before and after the fix, the changed line marked. */
function drawPage(c: CanvasRenderingContext2D, w: number, h: number, changed: number) {
	c.fillStyle = '#fbf6e8';
	c.fillRect(0, 0, w, h);
	c.fillStyle = color.ink;
	c.font = `700 ${h * 0.06}px ${font.mono}`;
	c.textBaseline = 'alphabetic';
	c.fillText('scheduler.py', w * 0.07, h * 0.1);
	const lines = ['def run(self):', '  while self.queue:', changed > 0.5 ? '    with self._lock:' : '    job = q.pop()', changed > 0.5 ? '      job = q.pop()' : '    run(job)', changed > 0.5 ? '    run(job)' : ''];
	c.font = `500 ${h * 0.05}px ${font.mono}`;
	lines.forEach((t, i) => {
		const y = h * (0.22 + i * 0.09);
		if (i === 2) {
			c.fillStyle = changed > 0.5 ? `rgba(34,211,107,${0.22 + 0.12 * changed})` : 'rgba(255,188,18,0.0)';
			c.fillRect(w * 0.04, y - h * 0.06, w * 0.92, h * 0.085);
		}
		c.fillStyle = i === 2 && changed > 0.5 ? '#0f8a4a' : color.ink;
		c.fillText(t, w * 0.07, y);
	});
}

/** An edit, as the model asks for it: find this text, put this in its place. */
function editCard() {
	const card = new Card(0.9, 0.62, 300, 0.02);
	card.draw((c, w, h) => {
		c.fillStyle = color.ink;
		c.font = `700 ${h * 0.16}px ${font.sans}`;
		c.fillText('Edit', w * 0.08, h * 0.22);
		c.font = `600 ${h * 0.11}px ${font.mono}`;
		c.fillStyle = 'rgba(240,71,60,0.16)';
		c.fillRect(w * 0.06, h * 0.33, w * 0.88, h * 0.2);
		c.fillStyle = '#b8271d';
		c.fillText('- job = q.pop()', w * 0.09, h * 0.47);
		c.fillStyle = 'rgba(34,211,107,0.2)';
		c.fillRect(w * 0.06, h * 0.6, w * 0.88, h * 0.2);
		c.fillStyle = '#0f8a4a';
		c.fillText('+ with self._lock:', w * 0.09, h * 0.74);
	});
	card.mesh.material.side = THREE.DoubleSide;
	return card;
}

export class LostAnswer {
	group = new THREE.Group();
	/** What a press lands on: each control. */
	controls: THREE.Object3D[] = [];
	private pageSurface: Surface;
	private changed = -1;
	private lower: THREE.Mesh;
	private upper: THREE.Mesh;
	private edit: Card;
	private retry: Card;
	private miss: THREE.Group;
	private receipt: THREE.Mesh;
	private cloud = new THREE.Group();
	private doubt: THREE.Group;
	private loupe = new THREE.Group();
	private upperArm = new THREE.Group();
	private foreArm = new THREE.Group();
	private lens = new THREE.Group();
	private v = { e: new THREE.Vector3(), r: new THREE.Vector3(), d: new THREE.Vector3(), u: new THREE.Vector3(), q: new THREE.Quaternion(), x: new THREE.Vector3(1, 0, 0) };
	private verdict: THREE.Group;
	private pressedAt = [-1e9, -1e9, -1e9, -1e9];
	/** The controls' moving parts, and what each acts on. */
	private wheel = new THREE.Group();
	private button = new THREE.Group();
	private cover = new THREE.Group();
	private key = new THREE.Group();
	private dial = new THREE.Group();
	private planSurface: Surface;
	private planShown = -1;
	private tokens: THREE.Mesh[] = [];
	private gear: THREE.Mesh;
	private processLamp: Lamp;
	private spark: THREE.Mesh;
	private fileSurface: Surface;
	private fileShown = -1;
	private lamps: Lamp[] = [];
	private flow = 0;
	private lastTime = 0;

	constructor() {
		const m = mats();
		const c = palette();
		const k = craft();
		const g = this.group;

		/* ---- the lectern, the page, the tube ---- */
		const lb = new Batch();
		lb.add(new THREE.CylinderGeometry(0.72, 0.82, 0.14, 40), c.brass, { p: [PAGE.x, 0.07, PAGE.z] });
		lb.add(new THREE.CylinderGeometry(0.13, 0.16, 1.2, 20), c.brass, { p: [PAGE.x, 0.7, PAGE.z] });
		lb.add(rbox(PAGE.w + 0.3, 0.1, 0.56, 0.04, 2), m.creamLight, { p: [PAGE.x, PAGE.y - 0.02, PAGE.z + 0.06] });
		lb.add(rbox(PAGE.w + 0.34, 0.16, 0.08, 0.03, 2), c.brass, { p: [PAGE.x, PAGE.y + 0.04, PAGE.z + 0.32] });
		// A frame behind the page that carries the tube's foot over its top.
		lb.add(rbox(PAGE.w + 0.2, PAGE.h + 0.2, 0.08, 0.04, 2), c.brass, { p: [PAGE.x, PAGE.y + PAGE.h / 2, PAGE.z - 0.2], r: [-PAGE.lean, 0, 0] });
		lb.add(rbox(0.5, TUBE.foot - (PAGE.y + PAGE.h) + 0.2, 0.36, 0.06, 2), c.brass, { p: [TUBE.x, (TUBE.foot + PAGE.y + PAGE.h) / 2, TUBE.z + 0.04] });
		lb.add(new THREE.CylinderGeometry(TUBE.r + 0.08, TUBE.r + 0.1, 0.22, 28), k.chrome, { p: [TUBE.x, TUBE.foot, TUBE.z] });
		g.add(lb.build('lectern'));
		shadowOn(g, PAGE.x, 0, PAGE.z, 1.8, 1.8, 0.35);
		const page = new Card(PAGE.w, PAGE.h, 260, 0.01);
		this.pageSurface = page.surface;
		page.mesh.position.set(PAGE.x, PAGE.y + PAGE.h / 2 + 0.05, PAGE.z - 0.12);
		page.mesh.rotation.x = -PAGE.lean;
		g.add(page.mesh);
		this.drawPage(0);
		const glass = new THREE.MeshPhysicalMaterial({ color: '#cfe6ff', transparent: true, opacity: 0.32, roughness: 0.06, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide });
		const tube = new THREE.CylinderGeometry(TUBE.r, TUBE.r, 1, 28, 1, true);
		tube.translate(0, 0.5, 0);
		this.lower = new THREE.Mesh(tube, glass);
		this.upper = new THREE.Mesh(tube, glass);
		this.lower.renderOrder = this.upper.renderOrder = 4;
		this.lower.position.set(TUBE.x, TUBE.foot + 0.11, TUBE.z);
		this.upper.position.set(TUBE.x, TUBE.snap, TUBE.z);
		this.upper.scale.y = TUBE.top - TUBE.snap;
		g.add(this.lower, this.upper);

		/* ---- the edit, the receipt, the cloud, the retry ---- */
		this.edit = editCard();
		this.edit.mesh.scale.setScalar(0.5);
		g.add(this.edit.mesh);
		this.retry = editCard();
		// Yaw first, then the tilt: however it turns, it lands face up.
		this.retry.mesh.rotation.order = 'YXZ';
		g.add(this.retry.mesh);
		this.miss = new THREE.Group();
		const mb = new Batch();
		mb.add(new THREE.CylinderGeometry(0.13, 0.13, 0.04, 24).rotateX(Math.PI / 2), m.red);
		mb.add(rbox(0.16, 0.035, 0.03, 0.01, 1), m.creamLight, { p: [0, 0, 0.025], r: [0, 0, Math.PI / 4] });
		mb.add(rbox(0.16, 0.035, 0.03, 0.01, 1), m.creamLight, { p: [0, 0, 0.025], r: [0, 0, -Math.PI / 4] });
		this.miss.add(mb.build('no-match'));
		this.retry.mesh.add(this.miss);
		this.miss.position.set(0.36, 0.22, 0.03);
		const receiptFace = new Surface(160, 100);
		receiptFace.draw((g2, w, h) => {
			g2.fillStyle = '#ffffff';
			g2.fillRect(0, 0, w, h);
			g2.fillStyle = '#22b866';
			g2.beginPath();
			g2.arc(w * 0.3, h / 2, h * 0.3, 0, Math.PI * 2);
			g2.fill();
			g2.strokeStyle = '#ffffff';
			g2.lineWidth = 7;
			g2.beginPath();
			g2.moveTo(w * 0.22, h * 0.5);
			g2.lineTo(w * 0.28, h * 0.6);
			g2.lineTo(w * 0.39, h * 0.4);
			g2.stroke();
			g2.fillStyle = 'rgba(17,26,46,0.35)';
			g2.fillRect(w * 0.5, h * 0.36, w * 0.38, 8);
			g2.fillRect(w * 0.5, h * 0.56, w * 0.28, 8);
		});
		this.receipt = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.22), new THREE.MeshStandardMaterial({ map: receiptFace.texture, roughness: 0.6, side: THREE.DoubleSide }));
		g.add(this.receipt);
		const cb = new Batch();
		const puffs: [number, number, number, number][] = [
			[0, 0, 0, 0.55],
			[0.55, -0.1, 0.1, 0.42],
			[-0.55, -0.12, 0.05, 0.4],
			[0.25, 0.32, -0.05, 0.38],
			[-0.3, 0.28, 0.08, 0.34]
		];
		for (const [x, y, z, r] of puffs) cb.add(new THREE.SphereGeometry(r, 22, 14), c.porcelain, { p: [x, y, z] });
		this.cloud.add(cb.build('cloud'));
		this.cloud.position.set(CLOUD.x, CLOUD.y, CLOUD.z);
		g.add(this.cloud);
		this.doubt = createSign('Did it happen?', 0.3, color.ink, m.amber);
		this.doubt.position.set(CLOUD.x, CLOUD.y + 0.95, CLOUD.z + 0.3);
		g.add(this.doubt);

		/* ---- the loupe on its arm ---- */
		const post = new Batch();
		post.add(new THREE.CylinderGeometry(0.42, 0.5, 0.16, 28), m.creamLight, { p: [-2.7, 0.08, -0.9] });
		post.add(new THREE.CylinderGeometry(0.1, 0.12, 2.3, 16), m.creamLight, { p: [-2.7, 1.3, -0.9] });
		post.add(new THREE.SphereGeometry(0.16, 16, 12), c.brass, { p: [-2.7, 2.48, -0.9] });
		g.add(post.build('loupe-post'));
		// Two segments, the upper arm from the post's top to the elbow and the forearm from the elbow to the lens's rim,
		// set each frame from where the lens is to be: the elbow stays up, the lens always faces the page.
		const arm = new Batch();
		arm.add(rbox(ARM.upper, 0.12, 0.12, 0.05, 2), m.creamLight, { p: [ARM.upper / 2, 0, 0] });
		arm.add(new THREE.SphereGeometry(0.11, 14, 10), c.brass, { p: [ARM.upper, 0, 0] });
		this.upperArm.add(arm.build('loupe-arm'));
		const fore = new Batch();
		fore.add(rbox(ARM.fore, 0.1, 0.1, 0.04, 2), m.creamLight, { p: [ARM.fore / 2, 0, 0] });
		this.foreArm.add(fore.build('loupe-fore'));
		const ring = new Batch();
		ring.add(new THREE.TorusGeometry(ARM.ring, 0.07, 14, 40), c.brass);
		ring.add(rbox(0.12, 0.2, 0.08, 0.03, 1), c.brass, { p: [-ARM.ring - 0.04, 0, 0] });
		this.lens.add(ring.build('loupe-ring'));
		const glassDisc = new THREE.Mesh(new THREE.CircleGeometry(ARM.ring - 0.02, 36), new THREE.MeshPhysicalMaterial({ color: '#dff3ff', transparent: true, opacity: 0.3, roughness: 0.02, clearcoat: 1, depthWrite: false, side: THREE.DoubleSide }));
		glassDisc.renderOrder = 4;
		this.lens.add(glassDisc);
		this.loupe.add(this.upperArm, this.foreArm, this.lens);
		this.loupe.name = 'loupe';
		g.add(this.loupe);
		this.verdict = createSign('It did. Carry on.', 0.26, '#ffffff', m.cobalt, true);
		this.verdict.position.set(PAGE.x, PAGE.y + 0.55, PAGE.z + 0.22);
		this.verdict.rotation.x = -PAGE.lean;
		g.add(this.verdict);

		/* ---- your console ---- */
		const con = new Batch();
		con.add(rbox(CONSOLE.w, 0.34, CONSOLE.d, 0.12, 3), c.wood, { p: [0, CONSOLE.y, CONSOLE.z] });
		con.add(rbox(CONSOLE.w + 0.06, 0.05, CONSOLE.d + 0.06, 0.02, 1), c.brass, { p: [0, CONSOLE.y + 0.17, CONSOLE.z] });
		for (const x of [-CONSOLE.w / 2 + 0.5, CONSOLE.w / 2 - 0.5]) for (const z of [-CONSOLE.d / 2 + 0.3, CONSOLE.d / 2 - 0.3]) con.add(new THREE.CylinderGeometry(0.12, 0.14, CONSOLE.y - 0.17, 16), k.chrome, { p: [x, (CONSOLE.y - 0.17) / 2, CONSOLE.z + z] });
		const top = CONSOLE.y + 0.2;
		const hits: THREE.Mesh[] = [];
		SLOTS.forEach((x, i) => {
			con.add(rbox(1.7, 0.18, 1.1, 0.08, 3), m.creamLight, { p: [x, top + 0.09, CONSOLE.z + 0.15] });
			const lamp = new Lamp(sharedRbox(0.36, 0.05, 0.08, 0.02, 2), ['#3b76ec', '#f0473c', '#ffbc12', '#22d36b'][i], 0.4);
			lamp.mesh.position.set(x, top + 0.09, CONSOLE.z + 0.72);
			g.add(lamp.mesh);
			this.lamps.push(lamp);
			const sign = createSign(CONTROLS[i], 0.2);
			sign.position.set(x, top - 0.1 + grown(0.2), CONSOLE.z + CONSOLE.d / 2 + 0.05);
			g.add(sign);
			const hit = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.1, 1.2), new THREE.MeshBasicMaterial());
			hit.visible = false;
			hit.position.set(x, top + 0.5, CONSOLE.z + 0.15);
			g.add(hit);
			hits.push(hit);
		});
		this.controls = hits;
		const ctl = top + 0.18;
		// Steer: a wheel on a short column.
		con.add(new THREE.CylinderGeometry(0.07, 0.09, 0.42, 14), k.chrome, { p: [SLOTS[0], ctl + 0.2, CONSOLE.z + 0.15], r: [0.5, 0, 0] });
		const wb = new Batch();
		wb.add(new THREE.TorusGeometry(0.46, 0.075, 14, 44), m.cobalt);
		for (let s = 0; s < 3; s++) wb.add(rbox(0.46, 0.05, 0.05, 0.02, 1), k.chrome, { p: [Math.cos((s * Math.PI * 2) / 3) * 0.23, Math.sin((s * Math.PI * 2) / 3) * 0.23, 0], r: [0, 0, (s * Math.PI * 2) / 3] });
		wb.add(new THREE.CylinderGeometry(0.11, 0.11, 0.1, 18).rotateX(Math.PI / 2), c.brass);
		this.wheel.add(wb.build('steer-wheel'));
		const wheelMount = new THREE.Group();
		wheelMount.position.set(SLOTS[0], ctl + 0.43, CONSOLE.z + 0.27);
		wheelMount.rotation.x = -0.9;
		wheelMount.add(this.wheel);
		g.add(wheelMount);
		// Cancel: a big red button in a chrome collar.
		// The collar's a sleeve the button sinks into, open at the top.
		con.add(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 32, 1, true), k.chrome, { p: [SLOTS[1], ctl + 0.06, CONSOLE.z + 0.15] });
		con.add(new THREE.TorusGeometry(0.43, 0.025, 8, 36).rotateX(Math.PI / 2), k.chrome, { p: [SLOTS[1], ctl + 0.12, CONSOLE.z + 0.15] });
		const bb = new Batch();
		bb.add(new THREE.CylinderGeometry(0.34, 0.36, 0.16, 32), m.red, { p: [0, 0.08, 0] });
		bb.add(new THREE.SphereGeometry(0.34, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), m.red, { p: [0, 0.16, 0], s: [1, 0.35, 1] });
		this.button.add(bb.build('cancel-button'));
		this.button.position.set(SLOTS[1], ctl + 0.1, CONSOLE.z + 0.15);
		g.add(this.button);
		// Terminate: a key in a chrome barrel, under an amber cover that flips up.
		con.add(new THREE.CylinderGeometry(0.2, 0.22, 0.14, 24), k.chrome, { p: [SLOTS[2], ctl + 0.07, CONSOLE.z + 0.15] });
		const kb = new Batch();
		kb.add(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 12), k.gunmetal, { p: [0, 0.06, 0] });
		kb.add(rbox(0.22, 0.2, 0.04, 0.04, 2), c.brass, { p: [0, 0.22, 0] });
		this.key.add(kb.build('terminate-key'));
		this.key.position.set(SLOTS[2], ctl + 0.14, CONSOLE.z + 0.15);
		g.add(this.key);
		const amberGlass = new THREE.MeshPhysicalMaterial({ color: '#ffb52e', transparent: true, opacity: 0.55, roughness: 0.12, clearcoat: 1, emissive: '#ff9a12', emissiveIntensity: 0.25, depthWrite: false });
		const cv = new Batch();
		cv.add(rbox(0.66, 0.5, 0.66, 0.06, 2), amberGlass, { p: [0.33, 0.25, 0] });
		const bolt = new THREE.Shape();
		bolt.moveTo(0.04, 0.16);
		bolt.lineTo(-0.08, -0.02);
		bolt.lineTo(0.0, -0.02);
		bolt.lineTo(-0.05, -0.16);
		bolt.lineTo(0.09, 0.03);
		bolt.lineTo(0.01, 0.03);
		bolt.closePath();
		cv.add(new THREE.ShapeGeometry(bolt), new THREE.MeshBasicMaterial({ color: '#fff1b0', side: THREE.DoubleSide }), { p: [0.33, 0.51, 0], r: [-Math.PI / 2, 0, 0] });
		this.cover.add(cv.build('terminate-cover'));
		// Hinged along its left edge: it flips up and over to the left, clear of the stand behind it.
		this.cover.position.set(SLOTS[2] - 0.33, ctl, CONSOLE.z + 0.15);
		g.add(this.cover);
		con.add(new THREE.CylinderGeometry(0.03, 0.03, 0.7, 10).rotateX(Math.PI / 2), k.chrome, { p: [SLOTS[2] - 0.36, ctl + 0.02, CONSOLE.z + 0.15] });
		// Roll back: a knurled dial with a curved arrow on its cap, in a green ring.
		con.add(new THREE.TorusGeometry(0.45, 0.04, 8, 36).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fe583' }), { p: [SLOTS[3], ctl + 0.02, CONSOLE.z + 0.15] });
		const arrow = new Surface(200, 200);
		arrow.draw((g2, w, h) => {
			g2.fillStyle = '#1f5fe0';
			g2.beginPath();
			g2.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2);
			g2.fill();
			g2.strokeStyle = '#ffffff';
			g2.lineWidth = 16;
			g2.lineCap = 'round';
			g2.beginPath();
			g2.arc(w / 2, h / 2, w * 0.27, -0.4, Math.PI * 1.35);
			g2.stroke();
			g2.fillStyle = '#ffffff';
			g2.beginPath();
			const ax = w / 2 + Math.cos(-0.4) * w * 0.27;
			const ay = h / 2 + Math.sin(-0.4) * w * 0.27;
			g2.moveTo(ax + 22, ay - 6);
			g2.lineTo(ax - 18, ay - 22);
			g2.lineTo(ax - 4, ay + 22);
			g2.closePath();
			g2.fill();
		});
		const db = new Batch();
		db.add(new THREE.CylinderGeometry(0.34, 0.36, 0.26, 32), k.chrome, { p: [0, 0.13, 0] });
		for (let r = 0; r < 16; r++) {
			const a = (r / 16) * Math.PI * 2;
			db.add(new THREE.BoxGeometry(0.04, 0.24, 0.05), k.gunmetal, { p: [Math.cos(a) * 0.355, 0.13, Math.sin(a) * 0.355], r: [0, -a, 0] });
		}
		this.dial.add(db.build('rollback-dial'));
		const cap = new THREE.Mesh(new THREE.CircleGeometry(0.3, 32), new THREE.MeshStandardMaterial({ map: arrow.texture, roughness: 0.4 }));
		cap.rotation.x = -Math.PI / 2;
		cap.position.y = 0.265;
		this.dial.add(cap);
		this.dial.position.set(SLOTS[3], ctl, CONSOLE.z + 0.15);
		g.add(this.dial);
		g.add(con.build('console'));
		shadowOn(g, 0, 0, CONSOLE.z, CONSOLE.w + 0.3, CONSOLE.d + 0.3, 0.3);

		/* ---- what each control acts on, on a stand behind it ---- */
		const stand = new Batch();
		const show = (i: number) => [SLOTS[i], top + 0.95, CONSOLE.z - 0.55] as [number, number, number];
		SLOTS.forEach((x) => {
			stand.add(rbox(1.5, 0.06, 0.5, 0.02, 1), m.creamLight, { p: [x, top + 0.32, CONSOLE.z - 0.55] });
			stand.add(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 10), k.chrome, { p: [x, top + 0.15, CONSOLE.z - 0.55] });
		});
		// Steer acts on the plan: a card of steps, whose next one changes.
		this.planSurface = new Surface(300, 220);
		const plan = panel(1.2, 0.88, this.planSurface);
		plan.position.set(...show(0));
		plan.position.y += 0.15;
		g.add(plan);
		stand.add(rbox(1.3, 0.98, 0.05, 0.04, 2), m.creamLight, { p: [SLOTS[0], top + 0.95 + 0.15, CONSOLE.z - 0.58] });
		// Cancel acts on the stream: words flowing out of a nozzle, which stop.
		stand.add(new THREE.CylinderGeometry(0.12, 0.16, 0.3, 18).rotateZ(Math.PI / 2), k.chrome, { p: [SLOTS[1] - 0.6, top + 0.44, CONSOLE.z - 0.55] });
		for (let i = 0; i < 5; i++) {
			const t = new THREE.Mesh(sharedRbox(0.2, 0.14, 0.14, 0.03, 2), m.amber);
			t.position.set(SLOTS[1] - 0.33 + i * 0.22, top + 0.42, CONSOLE.z - 0.55);
			this.tokens.push(t);
			g.add(t);
		}
		// Terminate acts on the process: a gear turning under a glass dome, its lamp lit.
		this.gear = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 12), k.chrome);
		this.gear.position.set(SLOTS[2], top + 0.66, CONSOLE.z - 0.55);
		g.add(this.gear);
		const dome = new THREE.Mesh(new THREE.SphereGeometry(0.4, 28, 16, 0, Math.PI * 2, 0, Math.PI / 2), k.glass);
		dome.position.set(SLOTS[2], top + 0.35, CONSOLE.z - 0.55);
		dome.renderOrder = 3;
		g.add(dome);
		this.processLamp = new Lamp(sharedRbox(0.14, 0.14, 0.14, 0.06, 2), color.green, 0.9);
		this.processLamp.mesh.position.set(SLOTS[2] + 0.55, top + 0.42, CONSOLE.z - 0.55);
		g.add(this.processLamp.mesh);
		this.spark = new THREE.Mesh(new THREE.ShapeGeometry(bolt), new THREE.MeshBasicMaterial({ color: '#ffd24a', side: THREE.DoubleSide, transparent: true }));
		this.spark.scale.setScalar(2.4);
		this.spark.position.set(SLOTS[2] - 0.55, top + 0.75, CONSOLE.z - 0.5);
		this.spark.visible = false;
		g.add(this.spark);
		// Roll back acts on the file: a copy of the page, its changed line going back the way it was.
		this.fileSurface = new Surface(260, 220);
		const file = panel(1.1, 0.93, this.fileSurface);
		file.position.set(...show(3));
		file.position.y += 0.15;
		g.add(file);
		stand.add(rbox(1.2, 1.03, 0.05, 0.04, 2), m.creamLight, { p: [SLOTS[3], top + 0.95 + 0.15, CONSOLE.z - 0.58] });
		g.add(stand.build('control-stands'));
		this.drawPlan(0);
		this.drawFile(0);
		this.reach(0);
	}

	private drawPage(changed: number) {
		const k = changed > 0.5 ? 1 : 0;
		if (k === this.changed) return;
		this.changed = k;
		this.pageSurface.draw((c, w, h) => drawPage(c, w, h, k));
	}

	private drawPlan(k: number) {
		const s = k > 0.5 ? 1 : 0;
		if (s === this.planShown) return;
		this.planShown = s;
		this.planSurface.draw((c, w, h) => {
			c.fillStyle = '#fbf6e8';
			c.fillRect(0, 0, w, h);
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.13}px ${font.sans}`;
			c.fillText('Plan', w * 0.08, h * 0.18);
			const steps = s ? ['Read the file', 'Add the lock', 'Run only its tests'] : ['Read the file', 'Add the lock', 'Run every test'];
			c.font = `600 ${h * 0.1}px ${font.sans}`;
			steps.forEach((t, i) => {
				const y = h * (0.36 + i * 0.2);
				c.fillStyle = i < 2 ? '#22b866' : s ? '#1f5fe0' : '#5a6b85';
				c.beginPath();
				c.arc(w * 0.12, y - h * 0.035, h * 0.04, 0, Math.PI * 2);
				c.fill();
				c.fillStyle = i === 2 && s ? '#1f5fe0' : color.ink;
				c.fillText(t, w * 0.2, y);
			});
		});
	}

	private drawFile(k: number) {
		const s = k > 0.5 ? 1 : 0;
		if (s === this.fileShown) return;
		this.fileShown = s;
		this.fileSurface.draw((c, w, h) => drawPage(c, w, h, s ? 0 : 1));
	}

	/** Sets the arm so the lens's centre is at the point between rest and look, the elbow bent upward. */
	private reach(k: number) {
		const { e, r, d, u, q, x } = this.v;
		r.lerpVectors(ARM.rest, ARM.look, k);
		this.lens.position.copy(r);
		// The forearm ends at the lens's rim on the side towards the post.
		const rim = r.clone().add(new THREE.Vector3(-ARM.ring - 0.08, 0, 0));
		d.subVectors(rim, ARM.shoulder);
		const dist = Math.min(d.length(), ARM.upper + ARM.fore - 0.01);
		d.normalize();
		const a = (ARM.upper * ARM.upper - ARM.fore * ARM.fore + dist * dist) / (2 * dist);
		const h = Math.sqrt(Math.max(0, ARM.upper * ARM.upper - a * a));
		u.set(0, 1, 0).addScaledVector(d, -d.y).normalize();
		e.copy(ARM.shoulder).addScaledVector(d, a).addScaledVector(u, h);
		this.upperArm.position.copy(ARM.shoulder);
		this.upperArm.quaternion.copy(q.setFromUnitVectors(x, e.clone().sub(ARM.shoulder).normalize()));
		this.foreArm.position.copy(e);
		this.foreArm.quaternion.copy(q.setFromUnitVectors(x, rim.clone().sub(e).normalize()));
		this.foreArm.scale.x = rim.distanceTo(e) / ARM.fore;
	}

	/** A press on control i: it does its thing again, whatever the story's at. */
	press(i: number) {
		this.pressedAt[i] = this.lastTime;
	}

	update(T: number, time: number) {
		const dt = Math.min(0.05, Math.max(0, time - this.lastTime));
		this.lastTime = time;

		/* ---- the edit comes down, and the line changes ---- */
		const down = inOut(seg(T, ...AT.down));
		this.edit.mesh.visible = down > 0 && down < 1;
		this.edit.mesh.position.set(TUBE.x, lerp(TUBE.top - 0.5, TUBE.foot + 0.3, down), TUBE.z);
		this.edit.mesh.rotation.set(0, down * Math.PI * 2, 0);
		this.drawPage(seg(T, ...AT.applied));

		/* ---- its receipt goes back up, the tube snaps, and it tumbles into a cloud ---- */
		const snap = outBack(seg(T, ...AT.snap), 2) * (1 - smooth(seg(T, ...AT.doubtGone)));
		const gap = snap * TUBE.gap;
		this.lower.scale.y = TUBE.snap - gap / 2 - (TUBE.foot + 0.11);
		this.upper.position.y = TUBE.snap + gap / 2;
		this.upper.scale.y = TUBE.top - (TUBE.snap + gap / 2);
		const up = inOut(seg(T, ...AT.up));
		const tumble = seg(T, ...AT.tumble);
		this.receipt.visible = up > 0 && tumble < 1;
		if (this.receipt.visible) {
			const rise = lerp(TUBE.foot + 0.3, TUBE.snap, up);
			const out = outCubic(tumble);
			// Out of the break and away, gone by the time it reaches the cloud's edge.
			this.receipt.position.set(lerp(TUBE.x, CLOUD.x - 1.05, out), rise + Math.sin(out * Math.PI) * 0.5 + out * (CLOUD.y - TUBE.snap), lerp(TUBE.z, CLOUD.z + 0.2, out));
			this.receipt.rotation.set(out * 5, out * 3, out * 7);
			this.receipt.scale.setScalar(Math.max(0.001, 1 - smooth(seg(tumble, 0.6, 0.95))));
		}
		const doubt = outBack(seg(T, ...AT.doubt), 1.6) * (1 - smooth(seg(T, ...AT.doubtGone)));
		this.cloud.visible = this.doubt.visible = doubt > 0.001;
		this.cloud.scale.setScalar(Math.max(0.001, doubt));
		this.doubt.scale.setScalar(Math.max(0.001, doubt));

		/* ---- the loupe looks ---- */
		// It looks, holds while the verdict comes, and is back up before the retry comes in.
		const look = smooth(seg(T, ...AT.look)) * (1 - inOut(seg(T, 28.47, 28.52)));
		this.reach(look);
		const v = outBack(seg(T, ...AT.verdict), 2);
		this.verdict.visible = v > 0.001;
		this.verdict.scale.setScalar(Math.max(0.001, v));

		/* ---- the same edit again: it bounces off, finding nothing to change ---- */
		const r = seg(T, ...AT.retry);
		this.retry.mesh.visible = r > 0 && r < 1;
		if (this.retry.mesh.visible) {
			const hitAt = 0.45;
			const hitPoint = new THREE.Vector3(PAGE.x + 0.4, PAGE.y + PAGE.h * (1 - LINE_V), PAGE.z + 0.35);
			const from = new THREE.Vector3(4.4, 3.4, 0.2);
			const land = new THREE.Vector3(2.4, 0.07, 0.6);
			if (r < hitAt) {
				const k = inOut(r / hitAt);
				this.retry.mesh.position.lerpVectors(from, hitPoint, k);
				this.retry.mesh.rotation.set(-0.2, -0.3 * (1 - k), 0);
			} else {
				const k = (r - hitAt) / (1 - hitAt);
				this.retry.mesh.position.lerpVectors(hitPoint, land, outCubic(k));
				this.retry.mesh.position.y += Math.sin(k * Math.PI) * 0.7;
				this.retry.mesh.rotation.set(-0.2 - k * 1.37, 0.4 * k, k * 0.5);
			}
			this.miss.scale.setScalar(Math.max(0.001, outBack(seg(r, hitAt, hitAt + 0.15), 2)));
		}
		// It lies where it landed for the rest of the story.
		if (r >= 1) {
			this.retry.mesh.visible = T < 29.3;
			this.retry.mesh.position.set(2.4, 0.07, 0.6);
			this.retry.mesh.rotation.set(-Math.PI / 2, 0.4, 0.5);
			this.miss.scale.setScalar(1);
		}

		/* ---- the four controls, each in its turn, and again whenever pressed ---- */
		const act = (i: number) => {
			const a = AT.controls + i * 0.05;
			const story = bell(T, a, a + 0.08);
			const pressed = time - this.pressedAt[i];
			return Math.max(story, pressed >= 0 && pressed < 2.6 ? bell(pressed, 0, 2.6) : 0);
		};
		const steer = act(0);
		this.wheel.rotation.z = -Math.sin(steer * Math.PI) * 1.2;
		this.drawPlan(steer > 0.35 ? 1 : 0);
		const cancel = act(1);
		this.button.position.y = this.dial.position.y + 0.1 - Math.min(1, cancel * 3) * 0.08;
		// The words flow until cancel stops them; they stay where they stopped.
		const flowing = cancel < 0.2;
		if (flowing) this.flow = (this.flow + dt * 0.6) % 0.22;
		this.tokens.forEach((t, i) => {
			t.position.x = SLOTS[1] - 0.33 + i * 0.22 + this.flow;
			(t.material as THREE.MeshPhysicalMaterial).emissiveIntensity = flowing ? 0.4 : 0.05;
		});
		const kill = act(2);
		this.cover.rotation.z = Math.min(1, kill * 3) * 1.55;
		this.key.rotation.y = Math.min(1, Math.max(0, kill * 3 - 1)) * (Math.PI / 2);
		const dead = kill > 0.3;
		if (!dead) this.gear.rotation.z -= dt * 3;
		this.processLamp.set(dead ? color.red : color.green, dead ? 0.3 : 0.9);
		this.spark.visible = kill > 0.25 && kill < 0.6;
		const back = act(3);
		this.dial.rotation.y = Math.sin(back * Math.PI) * 2.2;
		this.drawFile(back > 0.35 ? 1 : 0);
		this.lamps.forEach((l, i) => l.set(['#3b76ec', '#f0473c', '#ffbc12', '#22d36b'][i], 0.35 + act(i) * 1.6));
	}
}
