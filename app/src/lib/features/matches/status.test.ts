import { describe, expect, it } from 'vitest';
import { DISPUTE_ENDS, hasActions, matchStatusCopy } from './status.js';
import { sampleMatch, viewerMatch } from './testing.js';

describe('matchStatusCopy', () => {
	it('offers Confirm and Dispute on a pending match the player has to confirm', () => {
		expect(matchStatusCopy(viewerMatch()).actions).toEqual(['confirm', 'dispute']);
	});

	it('offers only Confirm on a pending match after the player withdrew their dispute', () => {
		// A withdrawn dispute is still their one dispute: the backend ignores a second one.
		const copy = matchStatusCopy(viewerMatch({ decision: 'withdraw' }));
		expect(copy.title).toBe('Is this the right score?');
		expect(copy.actions).toEqual(['confirm']);
		expect(copy.text).toContain(
			"You withdrew your dispute, so you can't dispute this match again."
		);
		expect(copy.text).not.toContain('If the score is wrong, dispute it.');
	});

	it('offers Withdraw on a disputed match the player disputed', () => {
		const copy = matchStatusCopy(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }));
		expect(copy.title).toBe('Disputed');
		expect(copy.text).toMatch(/^You said this score is wrong\./);
		expect(copy.notes).toContain(DISPUTE_ENDS);
		expect(copy.notes.join(' ')).toMatch(/can't dispute this match again/);
		expect(copy.actions).toEqual(['withdraw']);
	});

	it('offers nothing on a disputed match someone else disputed, and says how it ends', () => {
		for (const decision of ['none', 'confirm', 'withdraw'] as const) {
			const copy = matchStatusCopy(viewerMatch({ decision }, { status: 'disputed' }));
			expect(copy.actions).toEqual([]);
			expect(copy.notes).toEqual([DISPUTE_ENDS]);
		}
	});

	it('offers nothing for a match the player is not in', () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			expect(matchStatusCopy(sampleMatch({ status })).actions).toEqual([]);
		}
	});

	it('offers nothing on a confirmed or voided match, whatever the decision', () => {
		for (const status of ['confirmed', 'voided'] as const) {
			for (const decision of ['none', 'confirm', 'dispute', 'withdraw'] as const) {
				expect(matchStatusCopy(viewerMatch({ decision }, { status })).actions).toEqual([]);
			}
		}
	});

	it('says who settles a dispute and how it ends, with no moderator and no date', () => {
		expect(DISPUTE_ENDS).toMatch(/every player who disputed the score withdraws/);
		expect(DISPUTE_ENDS).toMatch(/event's organizer/);
		expect(DISPUTE_ENDS).toMatch(/voided/);
		expect(DISPUTE_ENDS).not.toMatch(/moderator/i);
		expect(DISPUTE_ENDS).not.toMatch(/\d/);
	});

	it('uses no em dashes and never says moderator', () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			for (const decision of ['none', 'confirm', 'dispute', 'withdraw'] as const) {
				for (const sides of [{}, { a: true }, { b: true }, { a: true, b: true }]) {
					const copy = matchStatusCopy(viewerMatch({ ...sides, decision }, { status }));
					const all = [copy.title, copy.text, ...copy.notes].join(' ');
					expect(all).not.toContain('—');
					expect(all).not.toMatch(/moderator/i);
				}
			}
		}
	});
});

describe('hasActions', () => {
	it('is true only when the panel offers a button', () => {
		expect(hasActions(viewerMatch())).toBe(true);
		expect(hasActions(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }))).toBe(true);
		expect(hasActions(viewerMatch({ decision: 'withdraw' }, { status: 'disputed' }))).toBe(false);
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }))).toBe(false);
	});
});
