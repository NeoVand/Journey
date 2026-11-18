/*
 * The channels between the cushions of one half, as the drawings leave them: for each, the line down its middle (places
 * on the chart) and the radius of the pipe it has room for. Found by measuring (tmp/channels.ts): every place the
 * drawings see is given its clearance from the nearest drawn cushion and the nearest machine, what is clear is thinned
 * to its middle lines, and each long stretch of those that stays channel-wide is a run. Not to be edited by hand. From
 * the front of the brain back.
 */
export const CHANNELS: { path: number[][]; r: number }[] = [
	{ r: 0.125, path: [[-0.512, 0.687], [-0.49, 0.684], [-0.456, 0.686], [-0.419, 0.691], [-0.381, 0.696], [-0.347, 0.696], [-0.31, 0.696], [-0.276, 0.694], [-0.254, 0.69]] }
];

/**
 * The roomy places left in the pockets, each with the block of electronics it has room for: where on the chart, a
 * place it lies towards (the way its pocket runs), and its size (along, across, tall). From the front of the brain back.
 */
export const POCKETS: { at: number[]; toward: number[]; size: number[] }[] = [
	{ at: [0.507, 0.374], toward: [0.552, 0.352], size: [0.39, 0.29, 0.31] },
	{ at: [0.391, 0.717], toward: [0.435, 0.691], size: [0.53, 0.38, 0.34] },
	{ at: [0.198, -0.48], toward: [0.221, -0.435], size: [0.48, 0.37, 0.34] },
	{ at: [0.208, 0.757], toward: [0.255, 0.738], size: [0.52, 0.31, 0.32] },
	{ at: [0.069, -0.757], toward: [0.119, -0.767], size: [0.56, 0.36, 0.34] },
	{ at: [0.005, -0.212], toward: [0.055, -0.214], size: [0.57, 0.4, 0.34] },
	{ at: [0.002, -0.656], toward: [0.044, -0.683], size: [0.5, 0.4, 0.34] },
	{ at: [-0.246, -0.086], toward: [-0.213, -0.049], size: [0.43, 0.36, 0.34] },
	{ at: [-0.568, 0.232], toward: [-0.518, 0.231], size: [0.36, 0.22, 0.27] },
	{ at: [-0.646, -0.618], toward: [-0.607, -0.586], size: [0.31, 0.25, 0.29] },
	{ at: [-0.778, 0.303], toward: [-0.749, 0.262], size: [0.38, 0.3, 0.31] }
];
