import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { drawIcon, font, Label, Surface } from '../kit/print';
import { fitting, plinth } from '../kit/parts';

export const MCP_W = 1.2;
export const MCP_H = 1.32;
export const MCP_D = 1.0;
/** The three things a server can offer, top to bottom, each behind its own drawer. */
export const MCP_DRAWERS = ['Tools', 'Resources', 'Prompts'] as const;
const DRAWER_ICONS = ['wrench', 'doc', 'chat'];
const DRAWER_Y = [0.66, 0.5, 0.34];
const FRONT_W = 0.84;
const FRONT_H = 0.13;
/** How far a drawer comes out, and how deep its tray is. */
export const MCP_TRAVEL = 0.38;
const TRAY_D = 0.4;

class McpDrawer {
	group = new THREE.Group();
	/** Where something lying at the back of the tray sits, in the drawer's own space. */
	floor = new THREE.Vector3(0, -0.043, -0.24);

	constructor(
		public y: number,
		name: string,
		icon: string
	) {
		const m = mats();
		const b = new Batch();
		// An open tray behind the front: floor, two sides and a back, so what's in it can be seen.
		b.add(rbox(FRONT_W - 0.06, 0.012, TRAY_D, 0.005, 1), m.steelSoft, { p: [0, -0.05, -TRAY_D / 2] });
		for (const s of [-1, 1]) b.add(rbox(0.012, 0.08, TRAY_D, 0.005, 1), m.steelSoft, { p: [s * (FRONT_W / 2 - 0.036), -0.012, -TRAY_D / 2] });
		b.add(rbox(FRONT_W - 0.06, 0.08, 0.012, 0.005, 1), m.steelSoft, { p: [0, -0.012, -TRAY_D + 0.006] });
		b.add(extrude(roundedRect(FRONT_W, FRONT_H, 0.035), 0.035, 0.01, 2, 8), m.creamLight, { p: [0, 0, 0.0175] });
		this.group.add(b.build('mcp-drawer'));
		const face = new Surface(420, 66);
		face.draw((c, w, h) => {
			drawIcon(c, icon, 16, (h - 34) / 2, 34, '#1f3e6e', 2.2);
			c.fillStyle = color.ink;
			c.font = `700 ${h * 0.5}px ${font.sans}`;
			c.textBaseline = 'middle';
			c.fillText(name, 62, h * 0.54);
		});
		const label = new THREE.Mesh(new THREE.PlaneGeometry(FRONT_W - 0.06, FRONT_H - 0.03), new THREE.MeshStandardMaterial({ map: face.texture, transparent: true, roughness: 0.6, depthWrite: false }));
		label.position.z = 0.0365;
		label.renderOrder = 2;
		this.group.add(label);
		this.group.position.set(0, y, MCP_D / 2);
	}

	/** out: 0 shut, 1 fully out. */
	pose(out: number) {
		this.group.position.z = MCP_D / 2 + out * MCP_TRAVEL;
	}
}

/** A small MCP server: it offers tools, resources and prompts, and the harness adds the tools to its list. */
export class McpServer {
	group = new THREE.Group();
	drawers: McpDrawer[] = [];
	private lamp: Lamp;
	private body = new THREE.Group();

	constructor() {
		const m = mats();
		const b = new Batch();
		plinth(b, MCP_W + 0.22, MCP_D + 0.22, 0.1);
		this.group.add(b.build('mcp-plinth'));
		const shell = new Batch();
		shell.add(extrude(chamferRect(MCP_W, MCP_H, 0.18, 0.07), MCP_D, 0.05, 4, 10), m.cobalt, { p: [0, 0.1 + MCP_H / 2, 0] });
		shell.add(extrude(roundedRect(0.84, 0.34, 0.11), 0.06, 0.02, 3, 10), m.creamLight, { p: [0, 1.04, MCP_D / 2 + 0.02] });
		// A dark slot the drawers sit in, so a drawer coming out looks like it comes from inside.
		shell.add(rbox(FRONT_W + 0.06, DRAWER_Y[0] - DRAWER_Y[2] + FRONT_H + 0.06, 0.02, 0.03, 2), m.recess, { p: [0, 0.5, MCP_D / 2 + 0.002] });
		// Port on the side that faces the harness.
		fitting(shell, [-MCP_W / 2, 0.9, -0.22], [-1, 0, 0], 0.042);
		this.body.add(shell.build('mcp'));
		const label = new Label('MCP', 0.17, { weight: 800 });
		label.mesh.position.set(-0.08, 1.038, MCP_D / 2 + 0.054);
		this.body.add(label.mesh);
		this.lamp = new Lamp(rbox(0.07, 0.07, 0.026, 0.024, 3), color.amber, 1);
		this.lamp.mesh.position.set(0.28, 1.038, MCP_D / 2 + 0.054);
		this.body.add(this.lamp.mesh);
		MCP_DRAWERS.forEach((name, i) => {
			const d = new McpDrawer(DRAWER_Y[i], name, DRAWER_ICONS[i]);
			this.drawers.push(d);
			this.body.add(d.group);
		});
		this.group.add(this.body);
	}

	update(connected: number, time: number) {
		if (connected >= 1) this.lamp.set(color.green, 0.9);
		else if (connected > 0) this.lamp.set(color.amber, 0.5 + Math.abs(Math.sin(time * 9)) * 0.9);
		else this.lamp.set(color.amber, 0.2);
	}

	/**
	 * The side trip's hold on the box. connected eases from amber to green without a jump, busy blinks it while it
	 * works, outs slides each drawer, and jolt gives the body a small squash when something lands.
	 */
	pose(connected: number, busy: number, outs: number[], jolt: number, time: number) {
		const blink = busy > 0 ? Math.abs(Math.sin(time * 9)) * busy : 0;
		this.lamp.mix(color.amber, color.green, Math.max(0, connected - busy), 0.25 + connected * 0.65 + blink * 0.8);
		this.drawers.forEach((d, i) => d.pose(outs[i] ?? 0));
		this.body.scale.set(1 + jolt * 0.02, 1 - jolt * 0.03, 1 + jolt * 0.02);
	}

	/** Drawers in and the body still, as the main story always has it. The lamp is the story's own. */
	rest() {
		this.drawers.forEach((d) => d.pose(0));
		this.body.scale.setScalar(1);
	}

	/** A point on a drawer's tray floor near its front, where something set in the drawer stands, in world space. */
	trayHinge(i: number, target: THREE.Vector3) {
		return this.drawers[i].group.localToWorld(target.set(0, -0.043, -0.09));
	}
}
