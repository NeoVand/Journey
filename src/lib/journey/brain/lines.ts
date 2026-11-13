/*
 * What Neo Mohsenvand's drawings from above, from the front and from the back have where the side drawing cannot see or
 * is not the one to believe, as lines down the middle of cushions: places on the chart, each with half the cushion's
 * width there. Found by measuring (tmp/propose.ts), and not to be edited by hand; the cushions' edges are the drawings'
 * own in any case (tones.ts), and a line only says which cushion a place belongs to.
 */

/**
 * The cushions traced by hand from the side drawing: which stretch of each one's line (from which of its places up to
 * which) lies where the side drawing is the one to believe, and how the cushion runs on before and after that stretch
 * as the other drawings have it.
 */
export const RUNS_ON: { name: string; from: number; to: number; before: number[][]; after: number[][] }[] = [
	{ name: 'A', from: 3, to: 15, before: [], after: [] },
	{ name: 'B', from: 2, to: 23, before: [], after: [] },
	{ name: 'C', from: 1, to: 14, before: [], after: [] },
	{ name: 'D', from: 3, to: 9, before: [], after: [] }
];

/**
 * The cushions the side drawing has not: of every patch of a colour that its cushions do not cover, the line along the
 * patch's ridge. Y is a yellow one and Z a blue, numbered from the front of the brain back.
 */
export const LINES: { name: string; tone: 'yellow' | 'blue'; line: number[][] }[] = [
	{ name: 'Z1', tone: 'blue', line: [[0.695, -0.721, 0.15], [0.734, -0.646, 0.26], [0.797, -0.555, 0.29], [0.848, -0.463, 0.32], [0.88, -0.368, 0.34], [0.89, -0.261, 0.36], [0.878, -0.147, 0.35], [0.846, -0.063, 0.28], [0.821, 0.059, 0.18], [0.789, 0.185, 0.14], [0.753, 0.28, 0.14], [0.717, 0.335, 0.14]] },
	{ name: 'Y1', tone: 'yellow', line: [[0.562, 0.831, 0.15], [0.58, 0.803, 0.2], [0.609, 0.753, 0.26], [0.638, 0.711, 0.32], [0.669, 0.669, 0.37], [0.708, 0.623, 0.35], [0.746, 0.578, 0.32], [0.785, 0.517, 0.31], [0.82, 0.452, 0.31], [0.858, 0.376, 0.32], [0.912, 0.288, 0.28], [0.962, 0.193, 0.19], [0.995, 0.076, 0.14]] },
	{ name: 'Z2', tone: 'blue', line: [[0.217, 0.874, 0.18], [0.246, 0.859, 0.22], [0.292, 0.847, 0.26], [0.337, 0.846, 0.25], [0.387, 0.849, 0.27], [0.433, 0.831, 0.26], [0.467, 0.799, 0.23], [0.491, 0.753, 0.21], [0.504, 0.703, 0.21], [0.521, 0.65, 0.21], [0.538, 0.625, 0.18]] },
	{ name: 'Y2', tone: 'yellow', line: [[0.055, 0.736, 0.14], [0.055, 0.791, 0.26], [0.032, 0.835, 0.27], [-0.01, 0.86, 0.16], [-0.051, 0.883, 0.14]] },
	{ name: 'Y3', tone: 'yellow', line: [[-0.112, 0.912, 0.14], [-0.158, 0.93, 0.18], [-0.208, 0.935, 0.25], [-0.25, 0.92, 0.24], [-0.295, 0.91, 0.22], [-0.345, 0.91, 0.18], [-0.381, 0.915, 0.14]] },
	{ name: 'Z3', tone: 'blue', line: [[-0.058, 0.702, 0.2], [-0.08, 0.73, 0.33], [-0.116, 0.763, 0.39], [-0.154, 0.783, 0.35], [-0.196, 0.793, 0.28], [-0.238, 0.792, 0.22], [-0.284, 0.789, 0.19], [-0.326, 0.79, 0.21], [-0.372, 0.798, 0.27], [-0.417, 0.809, 0.33], [-0.467, 0.817, 0.36], [-0.517, 0.812, 0.34], [-0.562, 0.795, 0.29], [-0.608, 0.771, 0.25], [-0.654, 0.741, 0.22], [-0.7, 0.71, 0.18], [-0.732, 0.687, 0.14]] },
	{ name: 'Z4', tone: 'blue', line: [[-0.721, 0.081, 0.14], [-0.681, 0.098, 0.21], [-0.642, 0.07, 0.27], [-0.638, -0.036, 0.21], [-0.646, -0.132, 0.2], [-0.645, -0.234, 0.17], [-0.621, -0.322, 0.2], [-0.567, -0.414, 0.23], [-0.484, -0.485, 0.15]] },
	{ name: 'Y4', tone: 'yellow', line: [[-0.948, 0.332, 0.14], [-0.91, 0.395, 0.2], [-0.852, 0.459, 0.27], [-0.799, 0.495, 0.33], [-0.745, 0.525, 0.33], [-0.696, 0.551, 0.29], [-0.646, 0.571, 0.25], [-0.597, 0.578, 0.19], [-0.564, 0.578, 0.15]] },
	{ name: 'Y5', tone: 'yellow', line: [[-0.84, -0.095, 0.17], [-0.826, -0.177, 0.32], [-0.795, -0.265, 0.4], [-0.744, -0.341, 0.24], [-0.697, -0.433, 0.18], [-0.64, -0.532, 0.18], [-0.532, -0.642, 0.21], [-0.484, -0.653, 0.16]] },
	{ name: 'Z5', tone: 'blue', line: [[-0.879, 0.236, 0.16], [-0.909, 0.162, 0.29], [-0.946, 0.074, 0.33], [-0.97, -0.025, 0.3], [-0.969, -0.166, 0.24], [-0.951, -0.273, 0.21], [-0.918, -0.368, 0.21], [-0.866, -0.467, 0.24], [-0.814, -0.557, 0.15]] }
];
