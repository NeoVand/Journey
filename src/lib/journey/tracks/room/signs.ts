import { createSign } from '../../kit/parts';
import { SIGN } from './layout';

/**
 * A sign in the room, `size` high as the story would print it, and SIGN times that on every screen: as large on a
 * desktop as the story prints its own signs on a phone, so they can be read from the whole-room view.
 */
export const roomSign = (text: string, size: number) => createSign(text, size * SIGN, undefined, undefined, true);
