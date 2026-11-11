import * as THREE from 'three';

/** Shared landmarks of the machine's interior, in cluster coordinates. */
export const ORIGIN = new THREE.Vector3(1.4, -46, 1.2);
export const PAD_Y = 0.3;
export const RAIL_Y = 0.56;
export const RAIL_Z = 6.3;

/*
 * The loop, seen from in front, is a pinwheel turning about your laptop: two rings of the same size, one above and to
 * the right, one below and to the left. A vertical axis runs through the harness: the model at the top of it, the
 * reply's glass column coming down it, the green results going up it from the workshop at the bottom. The request
 * leaves to the right along your laptop's level and climbs to the model; the calls leave to the left and go down to the
 * gates. Every pipe is straight runs and circular bends.
 */

/** Where the harness takes the reply in, through its roof, and gives the results back, through its back: the axis. */
export const AXIS_X = 1.1;

/**
 * The ring below and to the left: the gates and the workshop were drawn far off to the left, and stand here instead,
 * with the sandbox wall the results leave through just left of the axis. Everything built for them is moved by this.
 */
export const LOWER: [number, number, number] = [8, -11, 0];

/** The model, at the top of the axis: its brain, and the top of the island under it. The pedestal sits 1.4 left of the brain. */
export const MODEL_X = AXIS_X + 1.4;
export const MODEL_Z = 0.9;
export const MODEL_ISLAND_Y = 17;

/** The reply's glass column: out of the underside of the model's island, straight down into the harness's roof. */
export const STREAM_TOP: [number, number, number] = [AXIS_X, MODEL_ISLAND_Y - 1.42, -0.75];
export const STREAM_BOTTOM: [number, number, number] = [AXIS_X, 3.9, -0.75];

export const EASEL_POS = new THREE.Vector3(5.75, 0.2 + 3.1 / 2, 0.9);
export const EASEL_TILT = -0.13;
