import * as THREE from 'three';
import { Batch } from '../kit/batch';
import { rbox } from '../kit/geometry';
import { createIsland } from '../props/island';
import { paintCloud, seeded } from '../props/sky';
import { Brain, STEM_FOOT } from '../props/brain';
import { palette } from './palette';
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
 * The whole world, put together from its places: the desk, the aqueduct, the provider (the gatehouse, the hall, the
 * tower and the model), the foundry, the proving ground and the remote towers, each built in its own module from its own
 * drawings, all positioned by the masterplan. What runs between them, the lanes and what rides them, is here.
 */

/** Lays a flat outline (x, z pairs, seen from above) down as a shape the extruder turns into a slab facing up. */
const plan = (pts: [number, number][]) => pts.map(([x, z]) => [x, -z] as [number, number]);

export class Blocking {
	group = new THREE.Group();
	brain: Brain | null = null;
	tower = new Tower();
	gatehouse = new Gatehouse();
	hall = new Hall();
	aqueduct = new Aqueduct();
	desk = new Desk();
	foundry = new Foundry();
	proving = new Proving();
	remote = new RemoteTowers();
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
		const b = new Batch();
		this.group.add(b.build('world'), this.tower.group, this.gatehouse.group, this.hall.group, this.aqueduct.group, this.desk.group, this.foundry.group, this.proving.group, this.remote.group);
		this.platform();
		this.lanes();
		this.clouds();
		this.model();
	}



	/* ---------- the provider ---------- */
	private platform() {
		const outline = plan(P.PLATFORM);
		const isl = createIsland(outline, 1.2);
		isl.position.y = P.PLATFORM_Y;
		this.group.add(isl);
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

	/* ---------- a few soft clouds, far below ---------- */
	private clouds() {
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
		}
	}

	/* ---------- the model, on the tower's roof ---------- */
	private model() {
		// Fed from below: no hose at its crown, a glass pedestal under it with the two lanes inside, standing on the roof.
		const brain = new Brain('stem');
		brain.group.position.set(P.MODEL.stem.x - P.MODEL.stemX, P.ROOF_Y - STEM_FOOT, P.MODEL.stem.z);
		this.group.add(brain.group);
		this.brain = brain;
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
		this.brain?.update(6.9, time);
		this.tower.update(time);
		this.gatehouse.update(time);
		this.hall.update(time);
		this.aqueduct.update(time, cargo);
		this.desk.update(time);
		this.foundry.update(time);
		this.proving.update(time);
		this.remote.update(time);
	}
}
