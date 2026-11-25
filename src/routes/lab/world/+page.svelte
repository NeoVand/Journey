<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
	import { Stage } from '#lib/journey/stage.ts';
	import { Blocking } from '#lib/journey/sky/blocking.ts';
	import establishing from './view-establishing.jpg';
	import planView from './view-plan.jpg';
	import section from './view-section.jpg';
	import reader from './view-reader.jpg';
	import towerFront from './view-tower-front.jpg';
	import towerSection from './view-tower-section.jpg';
	import towerCrown from './view-tower-crown.jpg';
	import towerFloor from './view-tower-floor.jpg';
	import doorFront from './view-door-front.jpg';
	import doorAbove from './view-door-above.jpg';
	import doorSection from './view-door-section.jpg';
	import doorInside from './view-door-inside.jpg';
	import spanStretch from './view-span-stretch.jpg';
	import spanMast from './view-span-mast.jpg';
	import spanStart from './view-span-start.jpg';
	import spanArches from './view-span-arches.jpg';
	import { AQUEDUCT_CURVE } from '#lib/journey/sky/aqueduct.ts';
	import { GATEHOUSE, HALL, PLATFORM_Y, ROOF_Y, TOWER } from '#lib/journey/sky/masterplan.ts';

	/** A camera matching one drawing; a section view cuts away everything nearer the camera than x = clip. */
	type View = { id: string; label: string; image: string; aspect: number; fov: number; eye: THREE.Vector3; at: THREE.Vector3; clip?: number };
	/** A camera az degrees round from in front (+z), el degrees up, dist away from a target. */
	const orbit = (at: THREE.Vector3, az: number, el: number, dist: number) => {
		const a = (az * Math.PI) / 180;
		const e = (el * Math.PI) / 180;
		return new THREE.Vector3(Math.sin(a) * Math.cos(e), Math.sin(e), Math.cos(a) * Math.cos(e)).multiplyScalar(dist).add(at);
	};
	const views: View[] = [
		{ id: 'establishing', label: 'The whole world', image: establishing, aspect: 1.5, fov: 22, at: new THREE.Vector3(-0.9, 13, -24), eye: new THREE.Vector3(62, 50, 102) },
		{ id: 'plan', label: 'From above', image: planView, aspect: 2 / 3, fov: 28, at: new THREE.Vector3(0, 8, -22), eye: new THREE.Vector3(0, 150, 22) },
		{ id: 'section', label: 'In section', image: section, aspect: 1.5, fov: 22, at: new THREE.Vector3(0, 12, -21), eye: orbit(new THREE.Vector3(0, 12, -21), 90, 2, 140) },
		{ id: 'reader', label: 'From your desk', image: reader, aspect: 2 / 3, fov: 56, at: new THREE.Vector3(-1.2, 11.5, -32), eye: new THREE.Vector3(5.6, 6.4, 9.5) }
	];
	const T = TOWER.at;
	const mid = new THREE.Vector3(0, 22, T.z);
	views.push(
		{ id: 'tower-front', label: 'Tower', image: towerFront, aspect: 2 / 3, fov: 17, at: mid.clone(), eye: new THREE.Vector3(0, 22, T.z + 120) },
		{ id: 'tower-section', label: 'Tower in section', image: towerSection, aspect: 2 / 3, fov: 17, at: mid.clone(), eye: new THREE.Vector3(120, 22, T.z), clip: 0 },
		{ id: 'tower-crown', label: 'The crown', image: towerCrown, aspect: 1.5, fov: 30, at: new THREE.Vector3(0, ROOF_Y + 4.5, T.z), eye: orbit(new THREE.Vector3(0, ROOF_Y + 4.5, T.z), -28, 16, 30) },
		{ id: 'tower-floor', label: 'A floor inside', image: towerFloor, aspect: 1.5, fov: 58, at: new THREE.Vector3(-0.6, 15.9, T.z - 3), eye: new THREE.Vector3(1.6, 15.5, T.z + 3.6) }
	);
	const Y = PLATFORM_Y;
	const hallMid = new THREE.Vector3(0, Y + 3, (HALL.from + HALL.to) / 2);
	views.push(
		{ id: 'door-front', label: 'Front door', image: doorFront, aspect: 1.5, fov: 42, at: new THREE.Vector3(0, Y + 2.9, GATEHOUSE.at.z - 4), eye: new THREE.Vector3(0, Y + 2.3, GATEHOUSE.at.z + 11) },
		{ id: 'door-above', label: 'Door and hall', image: doorAbove, aspect: 1.5, fov: 32, at: hallMid.clone(), eye: orbit(hallMid, -18, 42, 40) },
		{ id: 'door-section', label: 'Hall in section', image: doorSection, aspect: 1.5, fov: 22, at: new THREE.Vector3(0, Y + 3.5, hallMid.z + 1), eye: new THREE.Vector3(70, Y + 3.5, hallMid.z + 1), clip: -0.3 },
		{ id: 'door-inside', label: 'Inside the hall', image: doorInside, aspect: 1.5, fov: 60, at: new THREE.Vector3(0, Y + 2.4, HALL.to), eye: new THREE.Vector3(0, Y + 2.0, HALL.from - 0.4) }
	);
	const on = (u: number) => AQUEDUCT_CURVE.getPointAt(u);
	views.push(
		{ id: 'span-stretch', label: 'The aqueduct', image: spanStretch, aspect: 1.5, fov: 40, at: on(0.75), eye: on(0.3).add(new THREE.Vector3(-3.2, 3.4, 2.5)) },
		{ id: 'span-mast', label: 'A mast', image: spanMast, aspect: 1.5, fov: 48, at: on(0.52).add(new THREE.Vector3(2.4, 2.6, 0)), eye: on(0.4).add(new THREE.Vector3(-0.4, 1.7, 0)) },
		{ id: 'span-start', label: 'Where it starts', image: spanStart, aspect: 1.5, fov: 34, at: new THREE.Vector3(0, 5, -11), eye: new THREE.Vector3(-14, 10, 12) },
		{ id: 'span-arches', label: 'The great arches', image: spanArches, aspect: 1.5, fov: 40, at: new THREE.Vector3(4, 7, -30), eye: new THREE.Vector3(24, -1, -10) }
	);

	let canvas: HTMLCanvasElement;
	let chosen = $state('establishing');
	let overlay = $state(0.45);
	let moving = $state(true);
	let readout = $state('');
	let box = $state({ w: 1, h: 1 });
	const view = $derived(views.find((v) => v.id === chosen) ?? views[0]);

	let goTo: (v: View) => void = () => {};

	function pick(v: View) {
		chosen = v.id;
		goTo(v);
	}

	onMount(() => {
		const stage = new Stage(canvas);
		stage.setSky(new THREE.Color('#5d9fe6'), new THREE.Color('#8fc0ee'), new THREE.Color('#d4e7f8'));
		stage.camera.far = 1500;
		const controls = new OrbitControls(stage.camera, canvas);
		controls.enableDamping = true;
		const world = new Blocking();
		stage.scene.add(world.group);

		// The picture is framed to the chosen view's shape, so the drawing can lie exactly over it.
		const size = () => {
			const a = view.aspect;
			const w = Math.min(innerWidth, innerHeight * a);
			const h = w / a;
			box = { w, h };
			stage.resize(w, h, Math.min(devicePixelRatio, 2));
			stage.camera.aspect = a;
			stage.camera.updateProjectionMatrix();
		};
		const cut = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0);
		goTo = (v) => {
			cut.constant = v.clip ?? 0;
			stage.renderer.clippingPlanes = v.clip === undefined ? [] : [cut];
			stage.camera.fov = v.fov;
			stage.camera.position.copy(v.eye);
			controls.target.copy(v.at);
			stage.camera.lookAt(v.at);
			size();
		};
		goTo(view);
		addEventListener('resize', size);

		let raf = 0;
		const start = performance.now();
		let last = 0;
		const frame = () => {
			raf = requestAnimationFrame(frame);
			const time = (performance.now() - start) / 1000;
			controls.update();
			if (moving) world.update(time);
			stage.focusLight(controls.target, 42);
			stage.render();
			if (time - last > 0.25) {
				last = time;
				const p = stage.camera.position;
				const t = controls.target;
				readout = `eye ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}   target ${t.x.toFixed(1)}, ${t.y.toFixed(1)}, ${t.z.toFixed(1)}   fov ${stage.camera.fov}`;
			}
		};
		frame();
		(window as unknown as { __lab: unknown }).__lab = { stage, controls, world, views, goTo: (id: string) => pick(views.find((v) => v.id === id) ?? views[0]) };

		return () => {
			cancelAnimationFrame(raf);
			removeEventListener('resize', size);
			controls.dispose();
			stage.dispose();
		};
	});
</script>

<svelte:head><title>The world, blocked out</title></svelte:head>

<div class="frame" style:width="{box.w}px" style:height="{box.h}px">
	<canvas bind:this={canvas}></canvas>
	<img class="over" src={view.image} alt="The view this camera matches" style:opacity={overlay} />
</div>

<header class="panel">
	<strong>The world, blocked out</strong>
	<span>Every place at its size and in its colours, from the masterplan, over the view it was drawn from.</span>
	<code>{readout}</code>
</header>

<nav class="panel">
	{#each views as v (v.id)}
		<button class:on={chosen === v.id} onclick={() => pick(v)}>{v.label}</button>
	{/each}
	<span class="rule"></span>
	<label>Drawing <input type="range" min="0" max="1" step="0.05" bind:value={overlay} /></label>
	<button class:on={moving} onclick={() => (moving = !moving)}>Tokens moving</button>
</nav>

<style>
	:global(body) {
		margin: 0;
		overflow: hidden;
		background: #0e1a2b;
	}
	.frame {
		position: fixed;
		left: 50%;
		top: 50%;
		translate: -50% -50%;
	}
	canvas {
		width: 100%;
		height: 100%;
		display: block;
		touch-action: none;
	}
	.over {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}
	.panel {
		position: fixed;
		background: rgb(255 255 255 / 0.78);
		backdrop-filter: blur(14px);
		border-radius: 14px;
		box-shadow: 0 6px 24px rgb(20 40 80 / 0.12);
		font:
			14px/1.4 system-ui,
			sans-serif;
		color: #1b2433;
	}
	header {
		top: 16px;
		left: 16px;
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		max-width: 420px;
	}
	code {
		font-size: 12px;
		color: #5a6577;
	}
	nav {
		bottom: 16px;
		left: 50%;
		translate: -50% 0;
		padding: 6px;
		display: flex;
		flex-wrap: wrap;
		gap: 4px;
		align-items: center;
	}
	button {
		font: inherit;
		border: 0;
		border-radius: 9px;
		padding: 7px 11px;
		background: transparent;
		color: inherit;
		cursor: pointer;
	}
	button:hover {
		background: rgb(30 60 120 / 0.08);
	}
	button.on {
		background: #1b2433;
		color: white;
	}
	label {
		display: flex;
		gap: 6px;
		align-items: center;
		padding: 0 8px;
	}
	.rule {
		width: 1px;
		align-self: stretch;
		background: rgb(30 40 60 / 0.15);
		margin: 4px;
	}
</style>
