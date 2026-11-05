import { describe, expect, it } from 'vitest';
import { HARNESSES, STOPS } from './content';
import { AGENT_MARK, CHECK_ICON, DRAWER_ICON, GATE_ICON, STOP_ICON } from './icons';

describe('icons', () => {
	it('gives every stop on the map its own icon', () => {
		expect(STOP_ICON).toHaveLength(STOPS.length);
		expect(new Set(STOP_ICON).size).toBe(STOPS.length);
	});

	it('gives every agent a mark', () => {
		expect(Object.keys(AGENT_MARK).sort()).toEqual(Object.keys(HARNESSES).sort());
	});

	it('has one icon for each drawer, check and gate', () => {
		expect(DRAWER_ICON).toHaveLength(4);
		expect(CHECK_ICON).toHaveLength(5);
		expect(GATE_ICON).toHaveLength(4);
	});
});
