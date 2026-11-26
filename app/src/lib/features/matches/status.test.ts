import { describe, expect, it } from 'vitest';
import {
	CORRECT_EVENT_NOTE,
	CORRECT_NOTE,
	DISPUTE_ENDS,
	HOLD_ENDS,
	HOLD_WHY,
	VOIDED_CORRECTED,
	canCorrect,
	hasActions,
	matchStatusCopy
} from './status.js';
import { sampleMatch, viewerMatch } from './testing.js';

describe('matchStatusCopy', () => {
	it('offers Confirm, Dispute and Correct on a pending match the player has to confirm', () => {
		expect(matchStatusCopy(viewerMatch()).actions).toEqual(['confirm', 'dispute', 'correct']);
	});

	it('offers Confirm and Correct, no Dispute, on a pending match after the player withdrew', () => {
		// A withdrawn dispute is still their one dispute: the backend ignores a second one.
		const copy = matchStatusCopy(viewerMatch({ decision: 'withdraw' }));
		expect(copy.title).toBe('Is this the right score?');
		expect(copy.actions).toEqual(['confirm', 'correct']);
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
		expect(copy.actions).toEqual(['withdraw', 'correct']);
	});

	it('offers only Correct on a disputed match someone else disputed, and says how it ends', () => {
		for (const decision of ['none', 'confirm', 'withdraw'] as const) {
			const copy = matchStatusCopy(viewerMatch({ decision }, { status: 'disputed' }));
			expect(copy.actions).toEqual(['correct']);
			expect(copy.notes).toEqual([DISPUTE_ENDS, `${CORRECT_NOTE} ${CORRECT_EVENT_NOTE}`]);
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
					for (const hold of [undefined, { vouched: false }, { vouched: true }]) {
						const copy = matchStatusCopy(viewerMatch({ ...sides, decision }, { status }), hold);
						const all = [copy.title, copy.text, ...copy.notes].join(' ');
						expect(all).not.toContain('—');
						expect(all).not.toMatch(/moderator/i);
					}
				}
			}
		}
	});
});

describe('matchStatusCopy for a held match', () => {
	it('reads On hold on a confirmed match, says why, and offers a vouch', () => {
		const copy = matchStatusCopy(
			viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' }),
			{ vouched: false }
		);
		expect(copy.title).toBe('On hold');
		expect(copy.text).toBe(HOLD_WHY);
		expect(copy.notes[0]).toBe('The score is confirmed. The match counts once the hold ends.');
		expect(copy.notes[1]).toMatch(/One player from each team needs to vouch\. You can't undo/);
		expect(copy.notes).toContain(HOLD_ENDS);
		expect(copy.actions).toEqual(['vouch']);
	});

	it('says the team vouched and offers nothing more once it has', () => {
		const copy = matchStatusCopy(viewerMatch({}, { status: 'confirmed' }), { vouched: true });
		expect(copy.title).toBe('On hold');
		expect(copy.notes[1]).toMatch(/^Your team has vouched for this match\./);
		expect(copy.notes[1]).toMatch(/other team vouches too, and the other match is vouched for/);
		expect(copy.actions).toEqual([]);
	});

	it('keeps Confirm and Dispute on a pending match the player has to confirm, then Vouch', () => {
		const copy = matchStatusCopy(viewerMatch(), { vouched: false });
		expect(copy.title).toBe('On hold');
		expect(copy.notes[0]).toMatch(/^Your team hasn't confirmed the score yet\./);
		expect(copy.actions).toEqual(['confirm', 'dispute', 'vouch', 'correct']);
		const withdrawn = matchStatusCopy(viewerMatch({ decision: 'withdraw' }), { vouched: true });
		expect(withdrawn.notes[0]).toMatch(/can't dispute this match again/);
		expect(withdrawn.actions).toEqual(['confirm', 'correct']);
	});

	it('says what a pending match still needs when the player has nothing to confirm', () => {
		expect(
			matchStatusCopy(viewerMatch({ a: true, decision: 'confirm' }), { vouched: false }).notes[0]
		).toBe('Your team confirmed the score. A player on the other team needs to confirm it too.');
		expect(matchStatusCopy(sampleMatch(), { vouched: false }).notes[0]).toBe(
			'The score also needs a player on each team to confirm it.'
		);
	});

	it('words the vouch for a member of the event organizer, who has no team in the match', () => {
		const match = sampleMatch({ status: 'confirmed' });
		const before = matchStatusCopy(match, { vouched: false });
		expect(before.notes[1]).toMatch(/as a member of the event's organizer/);
		expect(before.actions).toEqual(['vouch']);
		const after = matchStatusCopy(match, { vouched: true });
		expect(after.notes[1]).toMatch(/^Your organizer has vouched for this match\./);
		expect(after.actions).toEqual([]);
	});

	it('keeps the dispute copy on a disputed match and adds the hold', () => {
		const copy = matchStatusCopy(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }), {
			vouched: false
		});
		expect(copy.title).toBe('Disputed');
		expect(copy.notes).toContain(DISPUTE_ENDS);
		expect(copy.notes.join(' ')).toMatch(/This match is also on hold\./);
		expect(copy.actions).toEqual(['withdraw', 'vouch', 'correct']);
	});

	it('ignores a hold on a voided match', () => {
		const voided = viewerMatch({}, { status: 'voided' });
		expect(matchStatusCopy(voided, { vouched: false })).toEqual(matchStatusCopy(voided));
	});

	it('never names the other match and promises no date', () => {
		for (const text of [HOLD_WHY, HOLD_ENDS]) {
			expect(text).toMatch(/another match|the newer of the two|the other/i);
			expect(text).not.toMatch(/\d/);
			expect(text).not.toMatch(/M-/);
		}
	});
});

describe('hasActions', () => {
	it('is true only when the panel offers a button', () => {
		expect(hasActions(viewerMatch())).toBe(true);
		expect(hasActions(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }))).toBe(true);
		expect(hasActions(viewerMatch({ decision: 'withdraw' }, { status: 'disputed' }))).toBe(false);
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }))).toBe(false);
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }), { vouched: false })).toBe(
			true
		);
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }), { vouched: true })).toBe(
			false
		);
	});
});

describe('correcting a match', () => {
	it('offers Correct on a pending or disputed match the player is in', () => {
		expect(canCorrect(viewerMatch())).toBe(true);
		expect(canCorrect(viewerMatch({ a: true, decision: 'confirm' }))).toBe(true);
		expect(canCorrect(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }))).toBe(true);
	});

	it('offers no Correct on a confirmed or voided match, or to someone not in it', () => {
		expect(canCorrect(viewerMatch({}, { status: 'confirmed' }))).toBe(false);
		expect(canCorrect(viewerMatch({}, { status: 'voided' }))).toBe(false);
		for (const status of ['pending', 'disputed'] as const) {
			expect(canCorrect(sampleMatch({ status }))).toBe(false);
		}
	});

	it('offers no Correct when a player is private, since a correction must name every player', () => {
		const match = viewerMatch();
		const hidden = {
			...match,
			teamB: {
				...match.teamB,
				players: [{ code: null, displayName: 'Private player' }, ...match.teamB.players.slice(1)]
			}
		};
		expect(canCorrect(hidden)).toBe(false);
		expect(matchStatusCopy(hidden).actions).not.toContain('correct');
	});

	it('offers Correct, with what it does, on a pending match waiting on the other team', () => {
		const copy = matchStatusCopy(viewerMatch({ a: true, decision: 'confirm' }));
		expect(copy.title).toBe('Waiting for the other team');
		expect(copy.actions).toEqual(['correct']);
		expect(copy.notes).toEqual([CORRECT_NOTE]);
	});

	it('says only the organizer changes an event match, on a disputed match only', () => {
		expect(matchStatusCopy(viewerMatch()).notes.join(' ')).not.toContain(CORRECT_EVENT_NOTE);
		const disputed = matchStatusCopy(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }));
		expect(disputed.notes.join(' ')).toContain(CORRECT_EVENT_NOTE);
	});

	it('does not move the panel before the score for a correction alone', () => {
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }))).toBe(false);
		expect(hasActions(viewerMatch({ decision: 'none' }, { status: 'disputed' }))).toBe(false);
		expect(hasActions(viewerMatch())).toBe(true);
	});

	it('says on a voided match where a correction would be', () => {
		expect(matchStatusCopy(viewerMatch({}, { status: 'voided' })).notes).toEqual([
			VOIDED_CORRECTED
		]);
	});
});
