import { describe, expect, it } from 'vitest';
import {
	DISPUTE_ENDS,
	HOLD_ENDS,
	HOLD_WHY,
	canCorrect,
	hasActions,
	matchStatusCopy,
	panelIsQuiet,
	panelTone,
	progressInfo,
	statusInfo
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
		expect(copy.text).toMatch(/^You said this score is wrong,/);
		expect(copy.actions).toEqual(['withdraw', 'correct']);
	});

	it('offers only Correct on a disputed match someone else disputed', () => {
		for (const decision of ['none', 'confirm', 'withdraw'] as const) {
			const copy = matchStatusCopy(viewerMatch({ decision }, { status: 'disputed' }));
			expect(copy.title).toBe('Disputed');
			expect(copy.actions).toEqual(['correct']);
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

	it('says one sentence, with no em dashes, and never says moderator', () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			for (const decision of ['none', 'confirm', 'dispute', 'withdraw'] as const) {
				for (const sides of [{}, { a: true }, { b: true }, { a: true, b: true }]) {
					for (const hold of [undefined, { vouched: false }, { vouched: true }]) {
						const copy = matchStatusCopy(viewerMatch({ ...sides, decision }, { status }), hold);
						const all = [copy.title, copy.text].join(' ');
						// The longer explanations go in info popovers (frontend#285).
						expect(copy.text.match(/[.?!](\s|$)/g)).toHaveLength(1);
						expect(all).not.toContain('—');
						expect(all).not.toMatch(/moderator/i);
					}
				}
			}
		}
	});
});

describe('matchStatusCopy for a held match', () => {
	it('reads On hold on a confirmed match, says why in one sentence, and offers a vouch', () => {
		const copy = matchStatusCopy(
			viewerMatch({ a: true, b: true, decision: 'confirm' }, { status: 'confirmed' }),
			{ vouched: false }
		);
		expect(copy.title).toBe('On hold');
		expect(copy.text).toBe(
			"Another match has the same teams and date but other scores, so this one doesn't count yet."
		);
		expect(copy.actions).toEqual(['vouch']);
	});

	it('says the team vouched and offers nothing more once it has', () => {
		const copy = matchStatusCopy(viewerMatch({}, { status: 'confirmed' }), { vouched: true });
		expect(copy.title).toBe('On hold');
		expect(copy.text).toBe(
			'Your team vouched for this match, and the hold ends once the others vouch too.'
		);
		expect(copy.actions).toEqual([]);
	});

	it('keeps Confirm and Dispute on a pending match the player has to confirm, then Vouch', () => {
		const copy = matchStatusCopy(viewerMatch(), { vouched: false });
		expect(copy.title).toBe('On hold');
		expect(copy.actions).toEqual(['confirm', 'dispute', 'vouch', 'correct']);
		const withdrawn = matchStatusCopy(viewerMatch({ decision: 'withdraw' }), { vouched: true });
		expect(withdrawn.actions).toEqual(['confirm', 'correct']);
	});

	it('words the vouch for a member of the event organizer, who has no team in the match', () => {
		const match = sampleMatch({ status: 'confirmed' });
		const before = matchStatusCopy(match, { vouched: false });
		expect(before.actions).toEqual(['vouch']);
		const after = matchStatusCopy(match, { vouched: true });
		expect(after.text).toMatch(/^Your organizer vouched for this match,/);
		expect(after.actions).toEqual([]);
	});

	it('keeps the dispute title on a disputed match and says it is on hold too', () => {
		const copy = matchStatusCopy(viewerMatch({ decision: 'dispute' }, { status: 'disputed' }), {
			vouched: false
		});
		expect(copy.title).toBe('Disputed');
		expect(copy.text).toBe('You said this score is wrong, and the match is also on hold.');
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

	it('offers Correct on a pending match waiting on the other team', () => {
		const copy = matchStatusCopy(viewerMatch({ a: true, decision: 'confirm' }));
		expect(copy.title).toBe('Waiting for the other team');
		expect(copy.actions).toEqual(['correct']);
	});

	it('does not count a correction alone as something the player has to do', () => {
		expect(hasActions(viewerMatch({ a: true, decision: 'confirm' }))).toBe(false);
		expect(hasActions(viewerMatch({ decision: 'none' }, { status: 'disputed' }))).toBe(false);
		expect(hasActions(viewerMatch())).toBe(true);
	});
});

describe('panelTone', () => {
	it('is disputed for a disputed match, held or not', () => {
		const disputed = viewerMatch({ decision: 'dispute' }, { status: 'disputed' });
		expect(panelTone(disputed)).toBe('disputed');
		expect(panelTone(disputed, { vouched: false })).toBe('disputed');
	});

	it('is held for a match on hold that is not disputed or voided', () => {
		expect(panelTone(viewerMatch(), { vouched: true })).toBe('held');
		expect(panelTone(viewerMatch({}, { status: 'confirmed' }), { vouched: false })).toBe('held');
		expect(panelTone(viewerMatch({}, { status: 'voided' }), { vouched: false })).toBe('plain');
	});

	it('is action when the player has a step to take, and plain otherwise', () => {
		expect(panelTone(viewerMatch())).toBe('action');
		expect(panelTone(viewerMatch({ a: true, decision: 'confirm' }))).toBe('plain');
		expect(panelTone(viewerMatch({ a: true, b: true }, { status: 'confirmed' }))).toBe('plain');
	});
});

describe('panelIsQuiet', () => {
	it('is true only for a confirmed match that is not on hold', () => {
		const confirmed = viewerMatch({ a: true, b: true }, { status: 'confirmed' });
		expect(panelIsQuiet(confirmed)).toBe(true);
		expect(panelIsQuiet(confirmed, { vouched: true })).toBe(false);
		for (const status of ['pending', 'disputed', 'voided'] as const) {
			expect(panelIsQuiet(viewerMatch({}, { status }))).toBe(false);
		}
	});
});

describe('statusInfo', () => {
	it('explains how a dispute ends on a disputed match', () => {
		const info = statusInfo(viewerMatch({}, { status: 'disputed' }));
		expect(info?.label).toBe('What does disputed mean?');
		expect(info?.terms).toEqual([{ term: 'Disputed', text: DISPUTE_ENDS }]);
	});

	it('explains on hold, and vouch only while the side has not vouched', () => {
		const match = viewerMatch({}, { status: 'confirmed' });
		expect(statusInfo(match, { vouched: false })?.label).toBe('What do on hold and vouch mean?');
		expect(statusInfo(match, { vouched: true })?.label).toBe('What does on hold mean?');
		expect(statusInfo(match, { vouched: true })?.terms[0].text).toContain(HOLD_ENDS);
	});

	it('names every term on a disputed match on hold', () => {
		const info = statusInfo(viewerMatch({}, { status: 'disputed' }), { vouched: false });
		expect(info?.label).toBe('What do disputed, on hold and vouch mean?');
	});

	it('has nothing to explain on a pending, confirmed or voided match that is not held', () => {
		for (const status of ['pending', 'confirmed', 'voided'] as const) {
			expect(statusInfo(viewerMatch({}, { status }))).toBeNull();
		}
		expect(statusInfo(viewerMatch({}, { status: 'voided' }), { vouched: false })).toBeNull();
	});

	it('keeps each term to one or two sentences, in plain words', () => {
		const match = viewerMatch({}, { status: 'disputed' });
		for (const info of [
			statusInfo(match, { vouched: false }),
			statusInfo(sampleMatch({ status: 'confirmed' }), { vouched: false }),
			progressInfo(true, true)
		]) {
			for (const { text } of info!.terms) {
				expect(text).not.toContain('—');
				expect(text).not.toMatch(/moderator|OPEN rating/i);
			}
		}
		for (const { text } of progressInfo(true, true)!.terms) {
			expect(text.match(/[.?!](\s|$)/g)!.length).toBeLessThanOrEqual(2);
		}
	});
});

describe('progressInfo', () => {
	it('explains only the counts Home shows', () => {
		expect(progressInfo(true, false)?.label).toBe('What does disputed mean?');
		expect(progressInfo(false, true)?.label).toBe('What does on hold mean?');
		expect(progressInfo(true, true)?.label).toBe('What do disputed and on hold mean?');
		expect(progressInfo(false, false)).toBeNull();
	});
});
