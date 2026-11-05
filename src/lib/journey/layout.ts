import * as THREE from 'three';

/** Shared landmarks of the machine's interior, in cluster coordinates. */
export const ORIGIN = new THREE.Vector3(1.4, -46, 1.2);
export const PAD_Y = 0.3;
export const RAIL_Y = 0.56;
export const RAIL_Z = 6.3;

/** The green loop, harness end first. It is in the very first frame, and only explained much later. */
export const RETURN_POINTS: [number, number, number][] = [
	[0.4, 1.3, -1.75],
	[0.4, 1.3, -2.17],
	[0.37, 1.25, -2.6],
	[0, 0.2, -3.9],
	[-1.4, -1.5, -4.4],
	[-5.2, -2.3, -4],
	[-8, -3.6, -2.4],
	[-9.2, -8, -1.2],
	[-10.4, -12.4, 1.2],
	[-10.62, -13.72, 2.92],
	[-10.98, -14.25, 3.42],
	// Level through the fitting in the sandbox wall, then down to the hopper the results go into.
	[-11.5, -14.3, 3.45],
	[-12.06, -14.32, 3.47],
	[-12.5, -14.56, 3.56],
	[-12.796, -14.69, 3.6],
	[-13.086, -14.69, 3.6],
	[-13.5, -14.69, 3.6]
];

export const EASEL_POS = new THREE.Vector3(5.75, 0.2 + 3.1 / 2, 0.9);
export const EASEL_TILT = -0.13;
