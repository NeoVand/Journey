/** While the new room is being built it stands behind a flag: `?room=f3` shows it in place of the old one. */
export const ROOM_F3 = typeof location !== 'undefined' && new URLSearchParams(location.search).get('room') === 'f3';
