import * as THREE from 'three';
import { BubbleChatIcon, CubeIcon, GitBranchIcon, LaptopIcon, Layers01Icon, SlidersHorizontalIcon, Ticket01Icon } from '@hugeicons/core-free-icons';
import { Batch } from '../kit/batch';
import { extrude, rbox, sharedRbox } from '../kit/geometry';
import { color, Lamp, mats } from '../kit/materials';
import { panel } from '../kit/machines';
import { drawPageIcon, font, Surface, type IconData } from '../kit/print';
import { craft, guards } from '../kit/craft';
import { gearShape } from '../props/brain';
import { bell, outBack, seg } from '../kit/math';
import { palette } from '../sky/palette';

/*
 * Seven things called memory, as a cabinet of seven drawers. Each drawer holds one of them as a small scene that rises
 * out of it when it opens: the conversation's transcript on its spools and the disk it's saved to; the slice of it
 * sent this turn, under glass; the provider's claim ticket and its calendar; the cluster's cache blocks and the
 * hourglass that runs out on them; your laptop, its folders and a turning gear; a git branch with its pull request's
 * flag and the server it lives on. The last drawer is red, padlocked, and never opens: through its porthole the
 * model's weights glow, and nothing you do in a session reaches them.
 *
 * The drawers come out in a staircase, each a little further than the one above, so every scene can be seen at once.
 * Named by the conversation, or pressed, a drawer comes out further and its scene acts. Drawn from concepts/memory-r1.
 */

const W = 6.6;
const D = 3.6;
const BASE = 0.32;
const RH = 1.16;
const ROWS = 7;
const BODY = RH * ROWS;
const SIDE = 0.22;
/** A drawer: its front's width and height, how deep it goes, and how tall its tray's walls are. */
const FW = W - SIDE * 2 - 0.08;
const FH = 0.5;
const RED_H = RH - 0.14;
const DD = 3.4;
const WALL = 0.24;
/** How far the base, which holds the red drawer, reaches out in front of the cabinet: the staircase stands on it. */
const EXT = 3.2;
/** Where a drawer stands shut, its front flush with the cabinet's (the red one's with the base's), and how far each
 * comes out: a staircase down to the base, each half a metre further than the one above. */
const SHUT = (i: number) => D / 2 - 0.1 + (i === 6 ? EXT : 0);
const OUT = (i: number) => (i === 6 ? 0 : 0.6 + 0.5 * i);
/** Where in its drawer a scene stands: just behind the front, where the drawer above doesn't cover it. */
const SCENE_Z = -0.48;
/** The scenes are drawn small and shown a little larger, to fill their drawers. */
const SCENE_S = 1.3;

type Owner = 'harness' | 'provider' | 'cluster' | 'laptop' | 'remote';
const OWNER: Record<Owner, string> = { harness: '#5b6b86', provider: '#1f7a55', cluster: '#1f5fe0', laptop: '#b7701e', remote: '#7a4fc9' };

export const MEMORIES: { name: string; owner: string; who: Owner; life: string; icon: IconData }[] = [
	{ name: 'Conversation history', owner: 'The harness', who: 'harness', life: 'The session, saved to disk', icon: BubbleChatIcon as unknown as IconData },
	{ name: 'Current model context', owner: 'The harness', who: 'harness', life: 'One request', icon: Layers01Icon as unknown as IconData },
	{ name: 'Continuation state', owner: 'The provider', who: 'provider', life: 'Days, by policy', icon: Ticket01Icon as unknown as IconData },
	{ name: 'Inference cache', owner: 'The cluster', who: 'cluster', life: 'Minutes to an hour', icon: CubeIcon as unknown as IconData },
	{ name: 'Workspace', owner: 'Your laptop', who: 'laptop', life: 'Separate from the conversation', icon: LaptopIcon as unknown as IconData },
	{ name: 'External state', owner: 'Git hosts, MCP servers', who: 'remote', life: 'May outlive the run', icon: GitBranchIcon as unknown as IconData },
	{ name: 'Model parameters', owner: 'The provider', who: 'provider', life: 'Fixed', icon: SlidersHorizontalIcon as unknown as IconData }
];

/** A scene in a drawer: what it's made of, and how it moves, idle and when its drawer is named. */
interface Scene {
	group: THREE.Group;
	/** time: seconds, running. acting: 0 to 1 over the moments after it's named. */
	update(time: number, acting: number): void;
}

/** A transcript: a strip of paper with the session's messages on it, blue for you, amber for tool calls, green for results. */
function transcript() {
	const s = new Surface(1024, 160);
	s.draw((c, w, h) => {
		c.fillStyle = '#fbf6e8';
		c.fillRect(0, 0, w, h);
		const kinds = ['#5b8def', '#f2b33a', '#3cc77a', '#5b8def', '#f2b33a', '#3cc77a', '#f2b33a', '#3cc77a'];
		let x = 18;
		let i = 0;
		while (x < w - 30) {
			const bw = 70 + ((i * 37) % 60);
			c.fillStyle = kinds[i % kinds.length];
			c.beginPath();
			c.roundRect(x, 26 + (i % 2) * 58, bw, 40, 12);
			c.fill();
			c.fillStyle = 'rgba(17,26,46,0.22)';
			c.fillRect(x + 8, 26 + (i % 2) * 58 + 50, bw * 0.7, 6);
			x += bw + 16;
			i++;
		}
	});
	const t = s.texture;
	t.wrapS = THREE.RepeatWrapping;
	return t;
}

/** Two brass spools with paper wound on them, and the strip between, leaning back so it reads. */
function scroll(b: Batch, len: number, paper: THREE.Material, x0 = 0) {
	const m = mats();
	const c = palette();
	for (const s of [-1, 1]) {
		const x = x0 + s * (len / 2 + 0.1);
		b.add(new THREE.CylinderGeometry(0.17, 0.17, 0.54, 22).rotateX(Math.PI / 2), m.creamLight, { p: [x, 0.23, 0] });
		for (const z of [-0.3, 0.3]) b.add(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 22).rotateX(Math.PI / 2), c.brass, { p: [x, 0.23, z] });
		b.add(rbox(0.12, 0.2, 0.5, 0.03, 1), c.brass, { p: [x, 0.08, 0] });
	}
	const strip = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.5), paper);
	strip.rotation.x = -Math.PI / 2 + 0.55;
	strip.position.set(x0, 0.26, 0.02);
	return strip;
}

function history(paper: THREE.MeshStandardMaterial): Scene {
	const k = craft();
	const group = new THREE.Group();
	const b = new Batch();
	group.add(scroll(b, 3.0, paper, -0.35));
	group.add(b.build('history'));
	// Saved to disk: a disk on its own, its rim lit green.
	const disk = new THREE.Group();
	const db = new Batch();
	db.add(new THREE.CylinderGeometry(0.26, 0.26, 0.07, 32), k.chrome);
	db.add(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 16), k.gunmetal);
	db.add(new THREE.TorusGeometry(0.26, 0.022, 8, 32).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: '#3fe583' }));
	disk.add(db.build('disk'));
	disk.position.set(1.8, 0.15, 0);
	disk.rotation.x = 0.35;
	group.add(disk);
	return {
		group,
		update(time, acting) {
			paper.map!.offset.x = time * 0.015 + acting * 0.5;
			disk.rotation.y = time * 0.6 + acting * 9;
		}
	};
}

function context(paper: THREE.MeshStandardMaterial): Scene {
	const c = palette();
	const k = craft();
	const group = new THREE.Group();
	const b = new Batch();
	group.add(scroll(b, 2.6, paper, -0.2));
	// The slice sent this turn: under a glass box clamped over the newest stretch, its edges lit.
	const glow = new THREE.MeshBasicMaterial({ color: '#ffc85a' });
	const gb = new Batch();
	gb.add(rbox(1.0, 0.04, 0.6, 0.015, 1), glow, { p: [0, 0.38, 0] });
	for (const s of [-1, 1]) {
		gb.add(rbox(0.06, 0.38, 0.64, 0.02, 1), c.brass, { p: [s * 0.52, 0.22, 0] });
		gb.add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 12).rotateZ(Math.PI / 2), c.brass, { p: [s * 0.57, 0.3, 0] });
	}
	group.add(b.build('context'));
	const frame = new THREE.Group();
	frame.add(gb.build('context-frame'));
	const glass = new THREE.Mesh(sharedRbox(1.0, 0.36, 0.6, 0.03, 2), k.glass);
	glass.position.y = 0.19;
	glass.renderOrder = 3;
	frame.add(glass);
	frame.position.set(0.35, 0, 0);
	group.add(frame);
	return {
		group,
		update(time, acting) {
			glow.color.setHSL(0.11, 1, 0.62 + 0.12 * Math.sin(time * 2.4) + acting * 0.2);
			frame.position.y = bell(acting, 0, 1) * 0.12;
		}
	};
}

function continuation(): Scene {
	const m = mats();
	const c = palette();
	const group = new THREE.Group();
	const b = new Batch();
	// A jade lockbox, its lid open, the claim ticket standing in it.
	// Hollow, so the ticket stands in it: a floor, four walls, a brass rim.
	b.add(rbox(0.86, 0.04, 0.54, 0.015, 1), c.jade, { p: [-0.7, 0.02, 0] });
	for (const s of [-1, 1]) {
		b.add(rbox(0.05, 0.34, 0.54, 0.015, 1), c.jade, { p: [-0.7 + s * 0.405, 0.17, 0] });
		b.add(rbox(0.86, 0.34, 0.05, 0.015, 1), c.jade, { p: [-0.7, 0.17, s * 0.245] });
		b.add(rbox(0.9, 0.04, 0.06, 0.015, 1), c.brass, { p: [-0.7, 0.35, s * 0.26] });
		b.add(rbox(0.06, 0.04, 0.58, 0.015, 1), c.brass, { p: [-0.7 + s * 0.42, 0.35, 0] });
	}
	const lid = new THREE.Group();
	const lb = new Batch();
	lb.add(rbox(0.9, 0.07, 0.56, 0.03, 2), c.jadeDeep, { p: [0, 0, 0.28] });
	lid.add(lb.build('lid'));
	lid.position.set(-0.7, 0.36, -0.28);
	// Open past upright and leaning back, low enough to clear the drawer above.
	lid.rotation.x = -2.3;
	// A desk calendar, its days on a page, one ringed.
	const cal = new Surface(256, 256);
	cal.draw((g, w, h) => {
		g.fillStyle = '#fbf6e8';
		g.fillRect(0, 0, w, h);
		g.fillStyle = '#d6453b';
		g.fillRect(0, 0, w, h * 0.24);
		g.fillStyle = 'rgba(17,26,46,0.55)';
		for (let r = 0; r < 4; r++) for (let k = 0; k < 5; k++) g.fillRect(24 + k * 44, h * 0.34 + r * 40, 26, 22);
		g.strokeStyle = '#1f7a55';
		g.lineWidth = 6;
		g.beginPath();
		g.arc(24 + 2 * 44 + 13, h * 0.34 + 1 * 40 + 11, 20, 0, Math.PI * 2);
		g.stroke();
	});
	b.add(rbox(0.6, 0.06, 0.4, 0.02, 1), m.steelSoft, { p: [0.75, 0.03, 0] });
	const page = panel(0.52, 0.52, cal);
	page.position.set(0.75, 0.33, 0.06);
	page.rotation.x = -0.22;
	b.add(rbox(0.58, 0.58, 0.06, 0.03, 2), m.creamLight, { p: [0.75, 0.33, 0], r: [-0.22, 0, 0] });
	for (const s of [-1, 1]) b.add(new THREE.TorusGeometry(0.05, 0.015, 6, 14).rotateY(Math.PI / 2), c.brass, { p: [0.75 + s * 0.14, 0.63, 0.05] });
	group.add(b.build('continuation'), lid, page);
	const ticket = new THREE.Mesh(rbox(0.52, 0.3, 0.025, 0.02, 1), new THREE.MeshStandardMaterial({ color: '#bfeed6', emissive: '#2bd38a', emissiveIntensity: 0.25, roughness: 0.4 }));
	ticket.position.set(-0.7, 0.44, 0.02);
	ticket.rotation.x = -0.18;
	group.add(ticket);
	return {
		group,
		update(time, acting) {
			ticket.position.y = 0.44 + 0.02 * Math.sin(time * 1.6) + bell(acting, 0, 0.8) * 0.13;
			lid.rotation.x = -2.3 - bell(acting, 0, 0.6) * 0.25;
		}
	};
}

function cache(): Scene {
	const m = mats();
	const c = palette();
	const k = craft();
	const group = new THREE.Group();
	const b = new Batch();
	// A chrome tray of green blocks: the work the chips already did.
	b.add(rbox(1.5, 0.05, 0.66, 0.02, 1), k.chrome, { p: [-0.55, 0.025, 0] });
	const blocks: THREE.Mesh[] = [];
	const blockMat = (m.hbm as THREE.MeshPhysicalMaterial).clone();
	for (let r = 0; r < 2; r++)
		for (let i = 0; i < 3; i++) {
			const block = new THREE.Mesh(sharedRbox(0.4, 0.26, 0.26, 0.05, 2), blockMat);
			block.position.set(-0.55 + (i - 1) * 0.46, 0.18, (r - 0.5) * 0.3);
			blocks.push(block);
		}
	// An hourglass, running out on them.
	const glassGroup = new THREE.Group();
	const hb = new Batch();
	for (const y of [0, 0.62]) hb.add(new THREE.CylinderGeometry(0.22, 0.22, 0.045, 24), c.brass, { p: [0, y, 0] });
	for (let i = 0; i < 3; i++) {
		const a = (i / 3) * Math.PI * 2;
		hb.add(new THREE.CylinderGeometry(0.02, 0.02, 0.62, 8), c.brass, { p: [Math.cos(a) * 0.19, 0.31, Math.sin(a) * 0.19] });
	}
	glassGroup.add(hb.build('hourglass'));
	const bulbs = new THREE.Mesh(
		new THREE.LatheGeometry([0.02, 0.14, 0.15, 0.1, 0.025, 0.1, 0.15, 0.14, 0.02].map((r, i) => new THREE.Vector2(r, 0.04 + (i / 8) * 0.54)), 20),
		k.glass
	);
	bulbs.renderOrder = 3;
	glassGroup.add(bulbs);
	const sand = new THREE.MeshStandardMaterial({ color: '#f2c14e', roughness: 0.8 });
	const top = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.2, 18).rotateX(Math.PI), sand);
	const pile = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.16, 18), sand);
	top.position.y = 0.42;
	pile.position.y = 0.06 + 0.08;
	glassGroup.add(top, pile);
	glassGroup.position.set(0.85, 0.02, 0);
	group.add(b.build('cache'), ...blocks, glassGroup);
	return {
		group,
		update(time, acting) {
			// It runs out in a minute or so, and starts again: the cache keeps a recent start for minutes, not days.
			const left = 1 - ((time / 40) % 1);
			const run = Math.min(1, Math.max(0.001, left - acting));
			top.scale.set(Math.sqrt(run), run, Math.sqrt(run));
			top.position.y = 0.32 + 0.1 * run;
			pile.scale.set(Math.max(0.001, Math.sqrt(1 - run)), Math.max(0.001, 1 - run), Math.max(0.001, Math.sqrt(1 - run)));
			pile.position.y = 0.05 + 0.08 * (1 - run);
			// As it runs out, the blocks dim: an hour on, a request starting the same way would run them again.
			blockMat.emissiveIntensity = 0.15 + 0.5 * run;
		}
	};
}

function workspace(): Scene {
	const c = palette();
	const k = craft();
	const group = new THREE.Group();
	const b = new Batch();
	// Your laptop, honey wood, its screen showing folders.
	b.add(rbox(0.98, 0.05, 0.62, 0.02, 1), c.wood, { p: [-1.0, 0.025, 0.04] });
	b.add(rbox(0.86, 0.012, 0.36, 0.005, 1), c.walnut, { p: [-1.0, 0.056, 0.1] });
	const screen = new Surface(256, 160);
	screen.draw((g, w, h) => {
		g.fillStyle = '#123a8a';
		g.fillRect(0, 0, w, h);
		for (let i = 0; i < 3; i++) {
			g.fillStyle = '#f5c542';
			g.beginPath();
			g.roundRect(24 + i * 78, 50, 58, 44, 6);
			g.fill();
			g.fillRect(24 + i * 78, 42, 24, 12);
		}
	});
	const lid = new THREE.Group();
	const lb = new Batch();
	lb.add(rbox(0.98, 0.6, 0.04, 0.02, 1), c.wood, { p: [0, 0.3, 0] });
	lid.add(lb.build('laptop-lid'));
	const face = panel(0.86, 0.5, screen, 1);
	face.position.set(0, 0.31, 0.022);
	lid.add(face);
	lid.position.set(-1.0, 0.05, -0.26);
	lid.rotation.x = -0.32;
	// A box of folders, open at the top.
	b.add(rbox(0.54, 0.03, 0.36, 0.01, 1), c.walnut, { p: [0.2, 0.015, 0] });
	for (const s of [-1, 1]) {
		b.add(rbox(0.03, 0.24, 0.36, 0.01, 1), c.walnut, { p: [0.2 + s * 0.255, 0.12, 0] });
		b.add(rbox(0.54, 0.24, 0.03, 0.01, 1), c.walnut, { p: [0.2, 0.12, s * 0.165] });
	}
	const folders = new THREE.Group();
	const fb = new Batch();
	for (let i = 0; i < 3; i++) fb.add(rbox(0.46, 0.34, 0.03, 0.01, 1), new THREE.MeshStandardMaterial({ color: ['#f5c542', '#f0a93a', '#f7d77a'][i], roughness: 0.5 }), { p: [0, 0.21, (i - 1) * 0.09], r: [-0.12 + i * 0.1, 0, 0] });
	folders.add(fb.build('folders'));
	folders.position.set(0.2, 0, 0);
	// And something running: a gear, turning.
	const gear = new THREE.Mesh(extrude(gearShape(10, 0.22, 3), 0.07, 0.015, 1, 4), k.chrome);
	gear.position.set(1.05, 0.34, 0);
	b.add(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), k.gunmetal, { p: [1.05, 0.15, -0.05] });
	b.add(rbox(0.3, 0.04, 0.24, 0.01, 1), k.gunmetal, { p: [1.05, 0.02, -0.05] });
	group.add(b.build('workspace'), lid, folders, gear);
	return {
		group,
		update(time, acting) {
			gear.rotation.z = -time * 0.8 - acting * 6;
			folders.position.y = bell(acting, 0, 0.7) * 0.16;
		}
	};
}

function external(): Scene {
	const m = mats();
	const c = palette();
	const k = craft();
	const group = new THREE.Group();
	const b = new Batch();
	// A branch off the main line, on a little plate, with its pull request's flag at the end.
	b.add(rbox(1.7, 0.04, 0.5, 0.02, 1), m.creamLight, { p: [-0.55, 0.02, 0] });
	const node = new THREE.MeshStandardMaterial({ color: '#7fe0a8', emissive: '#1fbf6a', emissiveIntensity: 0.55, roughness: 0.3 });
	const main: [number, number][] = [
		[-1.3, 0],
		[-0.8, 0],
		[-0.3, 0],
		[0.2, 0]
	];
	const branch: [number, number][] = [
		[-0.8, 0],
		[-0.45, -0.18],
		[-0.05, -0.18]
	];
	for (const [x, z] of [...main, ...branch.slice(1)]) b.add(new THREE.SphereGeometry(0.07, 14, 10), node, { p: [x, 0.11, z] });
	const link = (a: [number, number], e: [number, number]) => {
		const len = Math.hypot(e[0] - a[0], e[1] - a[1]);
		b.add(new THREE.CylinderGeometry(0.022, 0.022, len, 8).rotateZ(Math.PI / 2), k.chrome, { p: [(a[0] + e[0]) / 2, 0.11, (a[1] + e[1]) / 2], r: [0, -Math.atan2(e[1] - a[1], e[0] - a[0]), 0] });
	};
	for (let i = 1; i < main.length; i++) link(main[i - 1], main[i]);
	for (let i = 1; i < branch.length; i++) link(branch[i - 1], branch[i]);
	b.add(new THREE.CylinderGeometry(0.018, 0.018, 0.56, 8), c.brass, { p: [-0.05, 0.39, -0.18] });
	const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.2, 6, 1), new THREE.MeshStandardMaterial({ color: '#f5b52e', roughness: 0.5, side: THREE.DoubleSide }));
	flag.geometry.translate(0.15, 0, 0);
	flag.position.set(-0.04, 0.56, -0.18);
	const flagBase = (flag.geometry.attributes.position as THREE.BufferAttribute).array.slice();
	// The server it lives on, out there: a small tower, its lights on.
	b.add(rbox(0.48, 0.66, 0.44, 0.04, 2), k.gunmetal, { p: [0.95, 0.33, 0] });
	const lit = new THREE.MeshBasicMaterial({ color: '#ffb84a' });
	for (let i = 0; i < 3; i++) b.add(rbox(0.32, 0.05, 0.02, 0.01, 1), lit, { p: [0.95, 0.18 + i * 0.16, 0.225] });
	group.add(b.build('external'), flag);
	return {
		group,
		update(time, acting) {
			const pos = flag.geometry.attributes.position as THREE.BufferAttribute;
			const wave = 0.03 + acting * 0.06;
			for (let i = 0; i < pos.count; i++) {
				const x = flagBase[i * 3];
				pos.setZ(i, Math.sin(x * 14 - time * (5 + acting * 8)) * wave * (x / 0.3));
			}
			pos.needsUpdate = true;
			flag.scale.setScalar(1 + bell(acting, 0, 0.6) * 0.3);
			lit.color.setHSL(0.1, 1, 0.6 + 0.12 * Math.sin(time * 3.1));
		}
	};
}

/** A drawer's face: its icon in a plaque, its name, and under the name who owns it and how long it lasts. */
function face(i: number, w: number, h: number) {
	const mem = MEMORIES[i];
	const red = i === 6;
	const s = new Surface(Math.round(w * 300), Math.round(h * 300));
	s.draw((c, cw, ch) => {
		const plate = ch * 0.78;
		const px = ch * 0.12;
		const py = (ch - plate) / 2;
		c.fillStyle = red ? '#fff3da' : '#fffaf0';
		c.beginPath();
		c.roundRect(px, py, plate, plate, plate * 0.22);
		c.fill();
		c.strokeStyle = red ? '#e6b350' : '#e4cfa6';
		c.lineWidth = 6;
		c.stroke();
		drawPageIcon(c, mem.icon, px + plate * 0.18, py + plate * 0.18, plate * 0.64, red ? '#a3221a' : '#16264a', 1.7);
		const tx = px + plate + ch * 0.16;
		c.textBaseline = 'alphabetic';
		c.fillStyle = red ? '#fff3da' : color.ink;
		c.font = `700 ${Math.round(ch * (red ? 0.26 : 0.4))}px ${font.display}`;
		c.fillText(mem.name, tx, ch * (red ? 0.42 : 0.5));
		c.font = `600 ${Math.round(ch * (red ? 0.18 : 0.24))}px ${font.sans}`;
		c.fillStyle = red ? '#ffe0b8' : OWNER[mem.who];
		c.fillText(mem.owner, tx, ch * (red ? 0.68 : 0.84));
		const ow = c.measureText(mem.owner).width;
		c.fillStyle = red ? '#ffffff' : '#5a6b85';
		c.font = `${red ? 800 : 500} ${Math.round(ch * (red ? 0.18 : 0.24))}px ${font.sans}`;
		c.fillText(mem.life, tx + ow + ch * 0.3, ch * (red ? 0.68 : 0.84));
	});
	return s;
}

export class MemoryCabinet {
	group = new THREE.Group();
	/** What a press lands on: each drawer's front. */
	fronts: THREE.Object3D[] = [];
	private drawers: { group: THREE.Group; scene: Scene | null; lamp: Lamp; content: THREE.Group }[] = [];
	private cube: THREE.MeshStandardMaterial;

	constructor() {
		const m = mats();
		const c = palette();
		const k = craft();
		// The cabinet: walnut sides, a cream top with chrome on its corners, a brass plinth, a shelf under every drawer
		// with a brass edge, chrome guards down its front corners, and three lit slots in its side.
		const b = new Batch();
		// The plinth runs under the base as well, which reaches out in front with the red drawer in it.
		b.add(rbox(W + 0.24, BASE, D + EXT + 0.24, 0.06, 2), c.brass, { p: [0, BASE / 2, EXT / 2] });
		const baseTop = BASE + RH;
		for (const s of [-1, 1]) b.add(rbox(SIDE, RH, EXT + 0.02, 0.05, 2), c.walnut, { p: [s * (W / 2 - SIDE / 2), BASE + RH / 2, D / 2 + EXT / 2 - 0.01] });
		b.add(rbox(W + 0.08, 0.08, EXT + 0.08, 0.03, 2), m.creamLight, { p: [0, baseTop + 0.0, D / 2 + EXT / 2 - 0.02] });
		b.add(rbox(W + 0.1, 0.04, 0.06, 0.015, 1), c.brass, { p: [0, baseTop + 0.03, D / 2 + EXT + 0.01] });
		b.add(rbox(W - SIDE * 2, 0.06, EXT, 0.02, 1), m.cream, { p: [0, BASE + 0.03, D / 2 + EXT / 2] });
		for (const s of [-1, 1]) {
			b.add(rbox(SIDE, BODY + 0.06, D, 0.05, 2), c.walnut, { p: [s * (W / 2 - SIDE / 2), BASE + BODY / 2, 0] });
			// An inset on the side, framed in brass.
			b.add(rbox(0.02, BODY - 0.9, D - 0.7, 0.01, 1), c.woodEdge, { p: [s * (W / 2 + 0.005), BASE + BODY / 2, 0] });
			for (const z of [-(D - 0.62) / 2, (D - 0.62) / 2]) b.add(rbox(0.03, BODY - 0.82, 0.04, 0.01, 1), c.brass, { p: [s * (W / 2 + 0.012), BASE + BODY / 2, z] });
			for (const y of [BASE + 0.41, BASE + BODY - 0.41]) b.add(rbox(0.03, 0.04, D - 0.58, 0.01, 1), c.brass, { p: [s * (W / 2 + 0.012), y, 0] });
		}
		for (let i = 0; i < 3; i++) b.add(rbox(0.03, 0.42, 0.1, 0.02, 1), new THREE.MeshBasicMaterial({ color: '#ffc85a' }), { p: [W / 2 + 0.02, BASE + BODY - 1.4 - i * 0.62, 0.6] });
		b.add(rbox(W + 0.12, 0.24, D + 0.12, 0.08, 3), m.creamLight, { p: [0, BASE + BODY + 0.12, 0] });
		for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(rbox(0.3, 0.27, 0.3, 0.05, 2), k.chrome, { p: [sx * (W / 2 - 0.08), BASE + BODY + 0.12, sz * (D / 2 - 0.08)] });
		b.add(rbox(W - SIDE * 2, BODY, 0.08, 0.02, 1), c.walnut, { p: [0, BASE + BODY / 2, -D / 2 + 0.04] });
		for (let r = 0; r <= ROWS; r++) {
			const y = BASE + r * RH;
			b.add(rbox(W - SIDE * 2, 0.06, D - 0.1, 0.02, 1), m.cream, { p: [0, y + 0.03, 0] });
			b.add(rbox(W - SIDE * 2, 0.05, 0.05, 0.015, 1), c.brass, { p: [0, y + 0.03, D / 2 - 0.05] });
		}
		guards(b, W, D / 2, baseTop + 0.1, BASE + BODY - 0.05, 0.06);
		guards(b, W, D / 2 + EXT, BASE + 0.1, baseTop - 0.04, 0.06);
		this.group.add(b.build('memory-cabinet'));

		const paper = new THREE.MeshStandardMaterial({ map: transcript(), roughness: 0.7, side: THREE.DoubleSide });
		const paper2 = paper.clone();
		paper2.map = paper.map!.clone();
		paper2.map.wrapS = THREE.RepeatWrapping;
		const scenes = [history(paper), context(paper2), continuation(), cache(), workspace(), external()];
		this.cube = new THREE.MeshStandardMaterial({ color: '#3d7bff', emissive: '#2f6dff', emissiveIntensity: 1.2, roughness: 0.3 });

		MEMORIES.forEach((_, i) => {
			const red = i === 6;
			const fh = red ? RED_H : FH;
			const group = new THREE.Group();
			const db = new Batch();
			// The tray, lined in navy, and its front.
			db.add(rbox(FW - 0.1, 0.05, DD, 0.02, 1), m.cream, { p: [0, 0.025, -DD / 2] });
			db.add(new THREE.PlaneGeometry(FW - 0.22, DD - 0.12), new THREE.MeshStandardMaterial({ color: '#1b2f63', roughness: 0.7 }), { p: [0, 0.052, -DD / 2], r: [-Math.PI / 2, 0, 0] });
			for (const s of [-1, 1]) db.add(rbox(0.06, WALL, DD, 0.02, 1), m.creamLight, { p: [s * (FW / 2 - 0.08), WALL / 2, -DD / 2] });
			db.add(rbox(FW - 0.1, WALL, 0.06, 0.02, 1), m.creamLight, { p: [0, WALL / 2, -DD + 0.03] });
			db.add(rbox(FW, fh, 0.12, 0.06, 3), red ? m.red : m.creamLight, { p: [0, fh / 2, 0.06] });
			db.add(rbox(FW + 0.04, 0.035, 0.14, 0.012, 1), red ? c.gold : c.brass, { p: [0, fh, 0.06] });
			// A brass pull toward the right, and the lamp at the far right.
			const hx = FW / 2 - (red ? 0.6 : 0.62);
			for (const s of [-1, 1]) db.add(new THREE.CylinderGeometry(0.03, 0.03, 0.12, 10).rotateX(Math.PI / 2), c.brass, { p: [hx + s * 0.28, fh * (red ? 0.3 : 0.5), 0.18] });
			db.add(new THREE.CylinderGeometry(0.035, 0.035, 0.64, 12).rotateZ(Math.PI / 2), c.brass, { p: [hx, fh * (red ? 0.3 : 0.5), 0.24] });
			if (red) {
				// Padlocked shut, and a porthole onto what it keeps: the weights, glowing.
				db.add(rbox(0.3, 0.26, 0.1, 0.04, 2), c.gold, { p: [0.82, fh * 0.42, 0.17] });
				db.add(new THREE.TorusGeometry(0.1, 0.028, 8, 18, Math.PI), k.chrome, { p: [0.82, fh * 0.42 + 0.13, 0.17] });
				db.add(new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).rotateX(Math.PI / 2), m.recess, { p: [0.82, fh * 0.4, 0.225] });
				db.add(new THREE.CircleGeometry(0.27, 32), m.recess, { p: [1.65, fh * 0.5, 0.122] });
				db.add(new THREE.TorusGeometry(0.29, 0.05, 12, 36), c.gold, { p: [1.65, fh * 0.5, 0.13] });
				for (let r = 0; r < 8; r++) {
					const a = (r / 8) * Math.PI * 2;
					db.add(new THREE.SphereGeometry(0.022, 8, 6), c.brass, { p: [1.65 + Math.cos(a) * 0.29, fh * 0.5 + Math.sin(a) * 0.29, 0.175] });
				}
			}
			group.add(db.build(`memory-drawer-${i}`));
			if (red) {
				const cube = new THREE.Mesh(sharedRbox(0.24, 0.24, 0.06, 0.03, 2), this.cube);
				cube.position.set(1.65, fh * 0.5, 0.15);
				cube.rotation.z = Math.PI / 4;
				const port = new THREE.Mesh(new THREE.CircleGeometry(0.27, 32), k.glass);
				port.position.set(1.65, fh * 0.5, 0.18);
				port.renderOrder = 3;
				group.add(cube, port);
			}
			// The words stop short of the pull, and on the red one, of its padlock.
			const ww = red ? 3.5 : FW - 1.5;
			const words = panel(ww, fh - 0.06, face(i, ww, fh - 0.06));
			words.position.set(-FW / 2 + 0.06 + ww / 2, fh / 2, 0.122);
			group.add(words);
			const lamp = new Lamp(sharedRbox(0.12, 0.12, 0.03, 0.04, 2), color.amber, 0.2);
			lamp.mesh.position.set(FW / 2 - 0.16, fh * 0.5, 0.136);
			group.add(lamp.mesh);
			// Its scene, standing in the tray just behind the front.
			const content = new THREE.Group();
			const scene = red ? null : scenes[i];
			if (scene) content.add(scene.group);
			content.position.set(0, 0.06, SCENE_Z);
			group.add(content);
			const hit = new THREE.Mesh(new THREE.BoxGeometry(FW, fh, 0.3), new THREE.MeshBasicMaterial());
			hit.visible = false;
			hit.position.set(0, fh / 2, 0.1);
			group.add(hit);
			this.fronts.push(hit);
			group.position.set(0, BASE + (ROWS - 1 - i) * RH + 0.07, SHUT(i));
			this.group.add(group);
			this.drawers.push({ group, scene, lamp, content });
		});
	}

	/**
	 * T: the story's time. named: which drawer the conversation (or a press) named, and how long ago in seconds.
	 * Each comes out in its turn as the story arrives, the scene in it rising after; a named one comes out further and acts.
	 */
	update(T: number, named: { i: number; since: number }, time: number, dt: number) {
		this.drawers.forEach((d, i) => {
			const red = i === 6;
			const a = 27.12 + i * 0.09;
			const open = outBack(seg(T, a, a + 0.1), 1.3);
			const rise = outBack(seg(T, a + 0.05, a + 0.15), 1.6);
			const isNamed = named.i === i;
			const acting = isNamed ? seg(named.since, 0, 2.4) : 0;
			const out = (d.group.userData.out as number | undefined) ?? 0;
			const want = isNamed && !red ? 1 : 0;
			const now = out + (want - out) * (1 - Math.exp(-dt * 8));
			d.group.userData.out = now;
			d.group.position.z = SHUT(i) + OUT(i) * open + now * 0.4;
			// The weights don't come out, whatever you do: named, the red drawer rattles in place and stays shut.
			d.group.position.x = isNamed && red ? Math.sin(named.since * 42) * 0.05 * Math.max(0, 1 - named.since / 0.9) : 0;
			d.content.scale.set(SCENE_S, Math.max(0.001, rise) * SCENE_S, SCENE_S);
			d.content.visible = rise > 0.001;
			if (d.scene && d.content.visible) d.scene.update(time, acting > 0 && acting < 1 ? acting : 0);
			const lit = seg(T, a, a + 0.06);
			const flare = isNamed ? Math.max(0, 1 - named.since / 1.6) : 0;
			d.lamp.mix(color.amber, red ? color.red : color.green, lit, 0.2 + lit * 0.8 + flare);
		});
		this.cube.emissiveIntensity = 1.0 + 0.35 * Math.sin(time * 1.7) + (named.i === 6 ? Math.max(0, 1 - named.since / 1.2) * 1.5 : 0);
	}
}
