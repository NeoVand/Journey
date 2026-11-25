import * as THREE from 'three';
import { createIsland } from '../props/island';
import { paintCloud, seeded } from '../props/sky';
import { STEM_FOOT, type Brain } from '../props/brain';
import type { Laptop } from '../props/laptop';
import type { Harness } from '../props/harness';
import type { RequestDoc } from '../props/request';
import type { SkillShelf } from '../props/skills';
import type { McpServer } from '../props/mcp';
import * as P from './masterplan';
import { Tower } from './tower';
import { Gatehouse } from './gatehouse';
import { Hall } from './hall';
import { Aqueduct } from './aqueduct';
import { Desk } from './desk';
import { Foundry } from './foundry';
import { Proving } from './proving';
import { RemoteTowers } from './remote';

/*
 * The world's places, standing: the desk, the aqueduct, the provider (the gatehouse, the hall, the tower), the foundry,
 * the proving ground and the remote towers, each built in its own module from its own drawings, all positioned by the
 * masterplan, on the provider's platform among a few soft clouds far below. What moves through them, the story's own
 * things, is the story's: it brings them, and they stand where placeOnDesk and placeModel say.
 */

/** Lays a flat outline (x, z pairs, seen from above) down as a shape the extruder turns into a slab facing up. */
const plan = (pts: [number, number][]) => pts.map(([x, z]) => [x, -z] as [number, number]);

export class Scenery {
	group = new THREE.Group();
	tower = new Tower();
	gatehouse = new Gatehouse();
	hall: Hall;
	aqueduct = new Aqueduct();
	desk = new Desk();
	foundry = new Foundry();
	proving = new Proving();
	remote = new RemoteTowers();
	clouds: THREE.Sprite[] = [];

	/** tokenizer: whether the hall stands its own; the story brings its own. */
	constructor({ tokenizer = true } = {}) {
		this.group.name = 'scenery';
		this.hall = new Hall(tokenizer);
		this.group.add(this.tower.group, this.gatehouse.group, this.hall.group, this.aqueduct.group, this.desk.group, this.foundry.group, this.proving.group, this.remote.group);
		const platform = createIsland(plan(P.PLATFORM), 1.2);
		platform.position.y = P.PLATFORM_Y;
		platform.name = 'platform';
		this.group.add(platform);
		this.layClouds();
	}

	/** A few soft clouds, far below everything, drifting. */
	private layClouds() {
		const rand = seeded(11);
		const tex = Array.from({ length: 4 }, (_, i) => paintCloud(300 + i * 31, i / 3));
		for (let i = 0; i < 26; i++) {
			const a = rand() * Math.PI * 2;
			const r = 10 + rand() * 70;
			const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex[i % 4], transparent: true, opacity: 0.85, depthWrite: false }));
			const w = 14 + rand() * 18;
			s.scale.set(w, w / 2, 1);
			s.position.set(r * Math.cos(a), -14 - rand() * 6, -24 + r * Math.sin(a) * 0.7);
			this.group.add(s);
			this.clouds.push(s);
		}
	}

	/**
	 * cargo: where each thing on the lanes is now, for the masts' readers. checks: the front door's, or -1 at rest. sealed:
	 * how many pieces of the reply the hall's press has sealed so far.
	 */
	update(time: number, cargo: THREE.Vector3[] = [], checks = -1, sealed = 0) {
		this.tower.update(time);
		this.gatehouse.update(time, checks);
		this.hall.update(time, sealed);
		this.aqueduct.update(time, cargo);
		this.foundry.update(time);
		this.proving.update(time);
		this.remote.update(time);
		this.clouds.forEach((s, i) => (s.position.x += Math.sin(time * 0.05 + i) * 0.002));
	}
}

/** The story's things on your desk, where the masterplan puts them. */
export function placeOnDesk({ laptop, harness, doc, skills, mcp }: { laptop: Laptop; harness: { holder: THREE.Object3D; harness: Harness }; doc?: RequestDoc; skills: SkillShelf; mcp: McpServer }) {
	laptop.group.position.copy(P.LAPTOP.at);
	laptop.group.rotation.y = 0;
	// The harness squashes itself when something lands in it, so its size is its holder's.
	harness.holder.position.copy(P.HARNESS.at);
	harness.holder.scale.setScalar(P.HARNESS.scale);
	if (!harness.holder.children.includes(harness.harness.group)) harness.holder.add(harness.harness.group);
	if (doc) {
		doc.group.position.copy(Desk.PAGE);
		doc.group.rotation.set(Desk.PAGE_LEAN, 0, 0);
	}
	skills.group.position.set(P.SKILLS.at.x, 0.18, P.SKILLS.at.z);
	skills.group.rotation.y = 0;
	skills.group.scale.setScalar(1.2);
	mcp.group.position.copy(P.LOCAL_MCP[2]);
	mcp.group.rotation.y = 0;
}

/** The model on the tower's roof: the brain stands on its glass pedestal over the shaft, fed from below. */
export function placeModel(brain: Brain) {
	// The whole of it, brain and pedestal, is what the conversation calls the model.
	brain.group.name = 'The model';
	brain.group.position.set(P.MODEL.stem.x - P.MODEL.stemX, P.ROOF_Y - STEM_FOOT, P.MODEL.stem.z);
}
