import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { Brain } from '../props/brain';
import { Laptop } from '../props/laptop';
import { Harness } from '../props/harness';
import { RequestDoc } from '../props/request';
import { SkillShelf } from '../props/skills';
import { McpServer } from '../props/mcp';
import { HARNESSES } from '../content';
import { palette } from './palette';
import * as P from './masterplan';
import { placeModel, placeOnDesk, Scenery } from './scenery';

/*
 * The lab's world: the scenery as the site stands it, the story's own things where they rest, and the lanes busy with
 * traffic, so every place can be looked at with something going through it.
 */

export class Blocking {
	group = new THREE.Group();
	scenery = new Scenery();
	brain = new Brain('stem');
	laptop = new Laptop();
	harness = new Harness();
	doc = new RequestDoc();
	skills = new SkillShelf();
	mcp = new McpServer();
	private up!: THREE.CatmullRomCurve3;
	private down!: THREE.CatmullRomCurve3;
	private tokens!: THREE.InstancedMesh;
	private pearls!: THREE.InstancedMesh;
	/** Across the internet the request and the reply travel as sealed capsules; inside the provider, as tokens. */
	private upSealed!: THREE.InstancedMesh;
	private downSealed!: THREE.InstancedMesh;
	/** The brass band round each capsule's middle. */
	private upBands!: THREE.InstancedMesh;
	private downBands!: THREE.InstancedMesh;
	private m = new THREE.Matrix4();

	constructor() {
		this.group.name = 'blocking';
		const holder = new THREE.Group();
		placeOnDesk({ laptop: this.laptop, harness: { holder, harness: this.harness }, doc: this.doc, skills: this.skills, mcp: this.mcp });
		placeModel(this.brain);
		this.doc.setHarness(HARNESSES.claude);
		this.doc.setRoll(1);
		this.doc.setTabs(1);
		this.laptop.setHarness(HARNESSES.claude);
		this.group.add(this.scenery.group, this.brain.group, this.laptop.group, holder, this.doc.group, this.skills.group, this.mcp.group);
		this.lanes();
	}



	/* ---------- the lanes and their tokens ---------- */
	private lanes() {
		const c = palette();
		this.up = new THREE.CatmullRomCurve3(P.upLane(), false, 'centripetal');
		this.down = new THREE.CatmullRomCurve3(P.downLane(), false, 'centripetal');
		const b = new Batch();
		// Each lane's tokens ride a thin chrome rail just behind and below them.
		for (const curve of [this.up, this.down]) {
			const rail = new THREE.CatmullRomCurve3(curve.getSpacedPoints(400).map((p) => p.clone().add(new THREE.Vector3(0, 0.05, -0.3))));
			b.add(new THREE.TubeGeometry(rail, 600, 0.045, 8), c.chrome);
		}
		this.group.add(b.build('lanes'));
		// One on the lane every so often, whatever it is carrying there.
		const n = Math.floor(this.up.getLength() / 1.35);
		this.tokens = new THREE.InstancedMesh(rbox(0.46, 0.46, 0.46, 0.09), c.amber, n);
		this.pearls = new THREE.InstancedMesh(new THREE.SphereGeometry(0.27, 20, 14), c.pearl, n);
		const capsule = new THREE.CapsuleGeometry(0.24, 0.5, 8, 20);
		const band = new THREE.TorusGeometry(0.25, 0.045, 8, 28).rotateX(Math.PI / 2);
		this.upSealed = new THREE.InstancedMesh(capsule, c.amber, n);
		this.downSealed = new THREE.InstancedMesh(capsule, c.pearl, n);
		this.upBands = new THREE.InstancedMesh(band, c.brass, n);
		this.downBands = new THREE.InstancedMesh(band, c.brass, n);
		this.group.add(this.tokens, this.pearls, this.upSealed, this.downSealed, this.upBands, this.downBands);
		this.update(0);
	}

	update(time: number) {
		const q = new THREE.Quaternion();
		const one = new THREE.Vector3(1, 1, 1);
		const none = new THREE.Vector3(0, 0, 0);
		const axis = new THREE.Vector3(0, 1, 0);
		/**
		 * Each lane's cargo along its curve: sealed capsules on the side of `seal` towards home, tokens past it. The
		 * request is cut into tokens by the tokenizer, the reply sealed again by the detokenizer's press.
		 */
		const cargo: THREE.Vector3[] = [];
		const place = (tokens: THREE.InstancedMesh, sealed: THREE.InstancedMesh, bands: THREE.InstancedMesh, curve: THREE.Curve<THREE.Vector3>, seal: number, speed: number) => {
			const n = tokens.count;
			for (let i = 0; i < n; i++) {
				const u = (i / n + time * speed) % 1;
				const p = curve.getPointAt(u);
				p.y += 0.32;
				const home = p.z > seal;
				if (home) cargo.push(p.clone());
				q.setFromUnitVectors(axis, curve.getTangentAt(u));
				this.m.compose(p, home ? q : q.identity(), home ? none : one);
				tokens.setMatrixAt(i, this.m);
				this.m.compose(p, q.setFromUnitVectors(axis, curve.getTangentAt(u)), home ? one : none);
				sealed.setMatrixAt(i, this.m);
				bands.setMatrixAt(i, this.m);
			}
			tokens.instanceMatrix.needsUpdate = true;
			sealed.instanceMatrix.needsUpdate = true;
			bands.instanceMatrix.needsUpdate = true;
		};
		place(this.tokens, this.upSealed, this.upBands, this.up, P.TOKENIZER.from - 3.5, 0.008);
		place(this.pearls, this.downSealed, this.downBands, this.down, P.HALL.from - 1.8, 0.008);
		this.brain.update(6.9, time);
		this.harness.update([0, 0, 0, 0], [1, 1, 1, 1], 1, time);
		this.mcp.update(1, time);
		this.laptop.update(0, 0, time, 1, false);
		this.scenery.update(time, cargo);
	}
}
