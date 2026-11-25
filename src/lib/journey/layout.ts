import * as THREE from 'three';

/** Shared landmarks of the machine's interior, in cluster coordinates. */
export const ORIGIN = new THREE.Vector3(1.4, -46, 1.2);
export const PAD_Y = 0.3;
export const RAIL_Y = 0.56;
export const RAIL_Z = 6.3;

/**
 * Your tools: the gates and the workshop were drawn in a ring of their own, far below and to the left of the old
 * island. They stand on your desk's right wing now, a fifth of their size, the workshop's floor just on the desk and the
 * gates on a plinth beside it: everything built for them keeps its own coordinates, and low() says where a point of
 * them is in the world.
 */
export const TOOLS = { s: 0.2, at: [15.1, 3.3, -2.08] as [number, number, number] };
export const low = (p: [number, number, number]): [number, number, number] => [TOOLS.at[0] + TOOLS.s * p[0], TOOLS.at[1] + TOOLS.s * p[1], TOOLS.at[2] + TOOLS.s * p[2]];
