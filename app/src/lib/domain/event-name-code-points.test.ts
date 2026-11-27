/**
 * The backend's `max_length` counts characters (code points), not UTF-16 units. Zod's `max` on a
 * string counts code points too, so the client check matches. This pins it (review F10).
 */
import { describe, expect, it } from 'vitest';
import { EVENT_NAME_MAX, eventInputSchema } from './schemas';

const valid = {
	name: '',
	kind: 'tournament',
	organizer: 'G-K7MQ-2RD4',
	club: '',
	start_date: '2026-10-04',
	end_date: '2026-10-05'
};

// One character that takes two UTF-16 units.
const WIDE = '\u{1F3D3}';

describe('eventInputSchema name length', () => {
	it(`takes ${EVENT_NAME_MAX} characters that each take two UTF-16 units`, () => {
		const name = WIDE.repeat(EVENT_NAME_MAX);
		expect(name.length).toBe(EVENT_NAME_MAX * 2);
		expect(eventInputSchema.safeParse({ ...valid, name }).success).toBe(true);
	});

	it(`refuses ${EVENT_NAME_MAX + 1} of them`, () => {
		const name = WIDE.repeat(EVENT_NAME_MAX + 1);
		expect(eventInputSchema.safeParse({ ...valid, name }).success).toBe(false);
	});
});
