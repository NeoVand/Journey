import { describe, expect, it } from 'vitest';
import { contextAt, PACKED_AT, WINDOW } from './context';
import { TEN_AT, TEN_STEP, TEN_TURNS } from './content';

describe('the context the header measures', () => {
	it('is empty until the harness opens its first drawer, then fills drawer by drawer', () => {
		expect(contextAt(1.5)).toBeNull();
		expect(contextAt(PACKED_AT[1] + 0.01)?.parts.map((p) => p.kind)).toEqual(['instructions', 'environment']);
		expect(contextAt(3)?.parts.map((p) => p.kind)).toEqual(['instructions', 'environment', 'tools', 'conversation']);
	});

	it('agrees with the ten turns’ ledger, turn by turn', () => {
		expect(contextAt(3)?.total).toBe(TEN_TURNS[0].fresh);
		expect(contextAt(25.5)?.total).toBe(TEN_TURNS[1].cached + TEN_TURNS[1].fresh);
		TEN_TURNS.forEach((turn, i) => expect(contextAt(TEN_AT + i * TEN_STEP + 0.001)?.total).toBe(turn.cached + turn.fresh));
		expect(contextAt(31)?.total).toBe(TEN_TURNS[9].cached + TEN_TURNS[9].fresh);
	});

	it('shows the long session at the press nearly full, then about a third once the summary takes the old turns’ place', () => {
		const before = contextAt(26.475);
		expect(before?.long).toBe(true);
		expect(before!.total / WINDOW).toBeGreaterThan(0.95);
		const after = contextAt(26.7);
		expect(after?.parts.some((p) => p.kind === 'summary')).toBe(true);
		expect(after!.total / WINDOW).toBeGreaterThan(0.25);
		expect(after!.total / WINDOW).toBeLessThan(0.45);
		expect(contextAt(27.2)?.long).toBe(false);
	});
});
