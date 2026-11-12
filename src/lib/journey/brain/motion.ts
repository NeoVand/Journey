/*
 * How the brain moves, as numbers: one law for a plate's rise, written once and used twice, by the shader that moves the
 * plates and by the test that checks nothing can touch anything else anywhere in that motion.
 */

/** How fast a pass runs over the brain, in its own units a second: from the intake to the brainstem in about a second and a half. */
export const PASS_SPEED = 9;
/** How far a plate rises, at the top of an ordinary rise. */
export const LIFT = 0.13;
/** A plate goes a little past the top of its rise before it settles there: this much, as a share of the rise. */
const OVER = 0.14;
/** The most a plate is ever off its seat, as a share of the rise: its overshoot, and no more however many passes meet. */
export const MOST = 1 + OVER + 0.02;
/** The times of a rise, in seconds since the pass arrived: up by, held until, down by, and the bounce on the seat over by. */
const UP = 0.11;
const HELD = 0.3;
const DOWN = 0.56;
const SETTLED = 0.7;
/** How high the bounce on the seat is, as a share of the rise. */
const BOUNCE = 0.06;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number) => {
	const t = clamp01((x - a) / (b - a));
	return t * t * (3 - 2 * t);
};

/**
 * How far off its seat a plate is, as a share of its rise, `t` seconds after a pass reached it: up smartly and a little
 * too far, held, let down, and one small bounce as it seats.
 */
export function rise(t: number) {
	if (t <= 0) return 0;
	const up = 1 - Math.pow(1 - clamp01(t / UP), 3);
	const over = OVER * Math.sin(clamp01((t - UP * 0.6) / (UP * 1.8)) * Math.PI);
	const down = 1 - smoothstep(HELD, DOWN, t);
	const bounce = BOUNCE * Math.sin(clamp01((t - DOWN) / (SETTLED - DOWN)) * Math.PI);
	return (up + over) * down + bounce;
}

/** The same law for the shaders, with the passes' ages and strengths: liftAt(d) is the rise of a plate a pass reaches after travelling d. */
export const RISE_GLSL = /* glsl */ `
float riseOf(float t) {
	if (t <= 0.0) return 0.0;
	float up = 1.0 - pow(1.0 - clamp(t / ${UP.toFixed(3)}, 0.0, 1.0), 3.0);
	float over = ${OVER.toFixed(3)} * sin(clamp((t - ${(UP * 0.6).toFixed(4)}) / ${(UP * 1.8).toFixed(4)}, 0.0, 1.0) * 3.14159265);
	float down = 1.0 - smoothstep(${HELD.toFixed(3)}, ${DOWN.toFixed(3)}, t);
	float bounce = ${BOUNCE.toFixed(3)} * sin(clamp((t - ${DOWN.toFixed(3)}) / ${(SETTLED - DOWN).toFixed(3)}, 0.0, 1.0) * 3.14159265);
	return (up + over) * down + bounce;
}
float liftAt(float d) {
	float up = 0.0;
	for (int i = 0; i < 4; i++) {
		if (uPassAge[i] < 0.0) continue;
		up += uPassGain[i] * riseOf(uPassAge[i] - d / ${PASS_SPEED.toFixed(1)});
	}
	return min(up, ${MOST.toFixed(3)});
}
`;
