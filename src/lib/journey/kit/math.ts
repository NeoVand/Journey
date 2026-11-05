export const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Normalised progress of `t` through the window [a, b]. Every scrubbed animation is built on this. */
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));

export const smooth = (t: number) => t * t * (3 - 2 * t);
export const smoother = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export const outCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const inCubic = (t: number) => t * t * t;
export const inOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/** Overshoots then settles: anything that "arrives" uses this so it lands with some weight. */
export const outBack = (t: number, s = 1.70158) => {
	const u = t - 1;
	return 1 + (s + 1) * u * u * u + s * u * u;
};

/** A damped spring response, for drawers and lids that should wobble to rest. */
export const spring = (t: number, freq = 3.2, decay = 5.5) =>
	t >= 1 ? 1 : 1 - Math.exp(-decay * t) * Math.cos(freq * Math.PI * t);

/** 0 → 1 → 0 over the window, for pulses. */
export const bell = (t: number, a: number, b: number) => {
	const x = seg(t, a, b);
	return Math.sin(x * Math.PI);
};

export function hash(n: number) {
	const x = Math.sin(n * 127.1) * 43758.5453;
	return x - Math.floor(x);
}
