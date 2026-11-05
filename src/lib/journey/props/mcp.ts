import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { chamferRect, extrude, rbox, roundedRect } from '../kit/geometry';
import { Lamp, color, mats } from '../kit/materials';
import { Label } from '../kit/print';
import { plinth, ventZ } from '../kit/parts';

/** A small MCP server: it offers tools, and the harness adds them to its list. */
export class McpServer {
	group = new THREE.Group();
	private lamp: Lamp;

	constructor() {
		const m = mats();
		const b = new Batch();
		const W = 1.2;
		const H = 1.32;
		const D = 1.0;
		plinth(b, W + 0.22, D + 0.22, 0.1);
		b.add(extrude(chamferRect(W, H, 0.18, 0.07), D, 0.05, 4, 10), m.cobalt, { p: [0, 0.1 + H / 2, 0] });
		b.add(extrude(roundedRect(0.84, 0.34, 0.11), 0.06, 0.02, 3, 10), m.creamLight, { p: [0, 1.04, D / 2 + 0.02] });
		ventZ(b, 0, 0.5, D / 2 + 0.002, 0.8, 0.42, 5);
		// Port on the side that faces the harness.
		b.add(rbox(0.06, 0.24, 0.24, 0.03, 2), m.steel, { p: [-W / 2 - 0.01, 0.9, -0.22] });
		this.group.add(b.build('mcp'));
		const label = new Label('MCP', 0.17, { weight: 800 });
		label.mesh.position.set(-0.08, 1.038, D / 2 + 0.054);
		this.group.add(label.mesh);
		this.lamp = new Lamp(rbox(0.07, 0.07, 0.026, 0.024, 3), color.amber, 1);
		this.lamp.mesh.position.set(0.28, 1.038, D / 2 + 0.054);
		this.group.add(this.lamp.mesh);
	}

	update(connected: number, time: number) {
		if (connected >= 1) this.lamp.set(color.green, 0.9);
		else if (connected > 0) this.lamp.set(color.amber, 0.5 + Math.abs(Math.sin(time * 9)) * 0.9);
		else this.lamp.set(color.amber, 0.2);
	}
}
