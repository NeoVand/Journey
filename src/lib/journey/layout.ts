import * as THREE from 'three';

/** Shared landmarks of the machine's interior, in cluster coordinates. */
export const ORIGIN = new THREE.Vector3(1.4, -46, 1.2);
export const PAD_Y = 0.3;
export const RAIL_Y = 0.56;
export const RAIL_Z = 6.3;

/**
 * The ring below your laptop: the gates and the workshop were drawn far off to the left, and stand here instead,
 * centred under the harness. Everything built for them is moved by this.
 */
export const LOWER: [number, number, number] = [37, -9, 0];
const low = (p: [number, number, number]): [number, number, number] => [p[0] + LOWER[0], p[1] + LOWER[1], p[2] + LOWER[2]];

/** The model, crowning the ring above your laptop: where its brain stands, and the top of the island under it. */
export const MODEL_X = 1.4;
export const MODEL_Z = 1.2;
export const MODEL_ISLAND_Y = 22;
/** The left side of the model's pedestal, where the reply leaves. The pedestal sits 1.4 left of the brain, 8.2 wide. */
export const MODEL_FLANK: [number, number, number] = [MODEL_X - 1.4 - 4.1, MODEL_ISLAND_Y + 0.95, MODEL_Z];

/**
 * The reply's way home: out of the left of the model's pedestal, off its island, down the left of the ring above your
 * laptop, and in over the top of it, straight down into the harness's roof. Model end first.
 */
export const STREAM_POINTS: [number, number, number][] = [
	MODEL_FLANK,
	[MODEL_FLANK[0] - 2.4, MODEL_FLANK[1] + 0.05, MODEL_Z],
	// Level over the island's edge before it turns down: the island reaches 10.5 left of the pedestal's middle.
	[-10.4, MODEL_FLANK[1] + 0.12, 1.0],
	[-13.4, MODEL_FLANK[1] - 1.0, 0.6],
	[-17.4, 19.6, 0.1],
	[-18.6, 15.4, -0.45],
	[-15.6, 12.4, -0.7],
	[-9.6, 11.5, -0.75],
	[-3.6, 11.4, -0.75],
	[-0.6, 10.9, -0.75],
	[0.85, 9.6, -0.75],
	[1.1, 7.8, -0.75],
	[1.1, 5.6, -0.75],
	[1.1, 3.9, -0.75]
];

/** The green loop, harness end first. It is in the very first frame, and only explained much later. */
export const RETURN_POINTS: [number, number, number][] = [
	[0.4, 1.3, -1.75],
	[0.4, 1.3, -2.17],
	[0.43, 1.25, -2.6],
	[0.9, 0.2, -3.9],
	[2.6, -1.5, -4.5],
	[7, -2.6, -4.4],
	[13, -5.2, -3.2],
	[19.5, -9.6, -1.4],
	[25.3, -15.6, -0.3],
	// Down into the workshop from above, as it was drawn: level through the fitting in the sandbox wall, then down to
	// the hopper the results go into.
	...(
		[
			[-10.4, -12.4, 1.2],
			[-10.62, -13.72, 2.92],
			[-10.98, -14.25, 3.42],
			[-11.5, -14.3, 3.45],
			[-12.06, -14.32, 3.47],
			[-12.5, -14.56, 3.56],
			[-12.796, -14.69, 3.6],
			[-13.086, -14.69, 3.6],
			[-13.5, -14.69, 3.6]
		] as [number, number, number][]
	).map(low)
];

export const EASEL_POS = new THREE.Vector3(5.75, 0.2 + 3.1 / 2, 0.9);
export const EASEL_TILT = -0.13;
