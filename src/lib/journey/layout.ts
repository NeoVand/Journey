import * as THREE from 'three';

/** Shared landmarks of the machine's interior, in cluster coordinates. */
export const ORIGIN = new THREE.Vector3(1.4, -46, 1.2);
export const PAD_Y = 0.3;
export const RAIL_Y = 0.56;
export const RAIL_Z = 6.3;

/** The green loop, harness end first. It is in the very first frame, and only explained much later. */
export const RETURN_POINTS: [number, number, number][] = [
	[0.4, 1.3, -1.78],
	[0.25, 1.2, -2.5],
	[0, 0.2, -3.9],
	[-1.4, -1.5, -4.4],
	[-5.2, -2.3, -4],
	[-8, -3.6, -2.4],
	[-9.2, -8, -1.2],
	[-10.4, -12.4, 1.2],
	[-11.2, -14.2, 3.4],
	[-12.4, -14.62, 3.6],
	[-13.9, -14.66, 3.6]
];

export const EASEL_POS = new THREE.Vector3(5.75, 0.2 + 3.1 / 2, 0.9);
export const EASEL_TILT = -0.13;
