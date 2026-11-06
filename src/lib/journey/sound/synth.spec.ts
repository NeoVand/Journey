import { describe, expect, it } from 'vitest';
import { porcelain, useRecordings } from './synth';

/** Just enough of the Web Audio API to play a recording, and as strict as a browser about the order of start and stop. */
function fakeAudio() {
	const sources: { started: boolean; stopped: boolean }[] = [];
	const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
	const node = () => ({ connect: (n: unknown) => n });
	const ctx = {
		createBufferSource() {
			const s = {
				...node(),
				buffer: null as unknown,
				playbackRate: param(),
				started: false,
				stopped: false,
				start() {
					s.started = true;
				},
				stop() {
					if (!s.started) throw new Error('cannot call stop without calling start first');
					s.stopped = true;
				}
			};
			sources.push(s);
			return s;
		},
		createGain: () => ({ ...node(), gain: param() })
	};
	return { ctx: ctx as unknown as AudioContext, sources };
}

describe('the voices', () => {
	it('can play a note cut short, which starts it before telling it when to stop', () => {
		const { ctx, sources } = fakeAudio();
		useRecordings(() => ({ duration: 2 }) as AudioBuffer);
		const out = { connect: (n: unknown) => n } as unknown as AudioNode;
		expect(() => porcelain(440, 0.6)(ctx, out, 0)).not.toThrow();
		expect(sources[0]).toMatchObject({ started: true, stopped: true });
	});

	it('lets a full note ring out', () => {
		const { ctx, sources } = fakeAudio();
		useRecordings(() => ({ duration: 2 }) as AudioBuffer);
		porcelain(440)(ctx, { connect: (n: unknown) => n } as unknown as AudioNode, 0);
		expect(sources[0]).toMatchObject({ started: true, stopped: false });
	});
});
