import { describe, expect, it } from 'vitest';
import {
	STATUS_LABELS,
	formatDate,
	formatDayMonth,
	formatLongDate,
	formatShortDate,
	matchCountLabel,
	matchHeadline,
	matchTags,
	matchTitle,
	pageFromSearch,
	rangeLabel,
	resultWord,
	rowLabel,
	rowPlayers,
	rowTeamNames,
	scoreLine,
	scoringName,
	sideScores,
	teamNames,
	viewpoint,
	wonTag
} from './format.js';
import {
	BEA,
	TAMSIN,
	bea,
	kit,
	games,
	oren,
	privatePlayer,
	sampleMatch,
	tamsin,
	team,
	viewerMatch
} from './testing.js';

describe('dates', () => {
	it('writes a short and a long date, whatever the time zone', () => {
		expect(formatDate('2026-11-14')).toBe('14 Nov 2026');
		expect(formatLongDate('2026-11-14')).toBe('Saturday 14 November 2026');
		expect(formatDate('2026-01-01')).toBe('1 Jan 2026');
		expect(formatLongDate('2026-12-31')).toBe('Thursday 31 December 2026');
	});

	it('gives back text that is not a date', () => {
		expect(formatDate('soon')).toBe('soon');
		expect(formatLongDate('2026-02-31')).toBe('2026-02-31');
	});
});

describe('scoreLine', () => {
	const match = sampleMatch();

	it('joins the games with commas and hyphens, team A first', () => {
		expect(scoreLine(match)).toBe('11-7, 9-11, 11-4');
	});

	it('reads from the other side when asked', () => {
		expect(scoreLine(match, 'b')).toBe('7-11, 11-9, 4-11');
	});

	it('has no em dash or en dash', () => {
		expect(scoreLine(match)).not.toMatch(/[–—]/);
	});
});

describe('per-side helpers', () => {
	const match = sampleMatch();

	it('lists points and which games a side won', () => {
		expect(sideScores(match, 'a')).toEqual([
			{ points: 11, won: true },
			{ points: 9, won: false },
			{ points: 11, won: true }
		]);
		expect(sideScores(match, 'b').map((s) => s.won)).toEqual([false, true, false]);
	});

	it('tags the winner with the games won and lost', () => {
		expect(wonTag(match, 'a')).toBe('Won 2–1');
		expect(wonTag(match, 'b')).toBe('Won 1–2');
	});
});

describe('teamNames', () => {
	it('joins names, and marks the player', () => {
		expect(teamNames(team('a', tamsin, oren))).toBe('Tamsin Vale and Oren Quill');
		expect(teamNames(team('a', tamsin, oren), TAMSIN)).toBe('Tamsin Vale (you) and Oren Quill');
		expect(teamNames(team('b', bea))).toBe('Bea Marlowe');
	});

	it('shows a private player as "Private player"', () => {
		expect(teamNames(team('b', privatePlayer, bea), TAMSIN)).toBe('Private player and Bea Marlowe');
	});

	it('does not mark a private player as you', () => {
		expect(teamNames(team('a', privatePlayer), null)).toBe('Private player');
	});
});

describe('titles and labels', () => {
	it('names the format and the games', () => {
		expect(matchTitle({ format: 'doubles', bestOf: 3 })).toBe('Doubles, best of 3');
		expect(matchTitle({ format: 'singles', bestOf: 1 })).toBe('Singles, 1 game');
		expect(matchTitle({ format: 'singles', bestOf: 5 })).toBe('Singles, best of 5');
	});

	it('names the scoring and the statuses', () => {
		expect(scoringName('side_out')).toBe('Side-out');
		expect(scoringName('rally')).toBe('Rally');
		expect(STATUS_LABELS).toEqual({
			pending: 'Pending',
			confirmed: 'Confirmed',
			disputed: 'Disputed',
			voided: 'Voided'
		});
	});

	it('counts matches', () => {
		expect(matchCountLabel(1)).toBe('1 match');
		expect(matchCountLabel(47)).toBe('47 matches');
	});
});

describe('rangeLabel', () => {
	it('writes "1–20 of 47" with an en dash', () => {
		expect(rangeLabel(0, 20, 47)).toBe('1–20 of 47');
		expect(rangeLabel(40, 7, 47)).toBe('41–47 of 47');
		expect(rangeLabel(0, 0, 0)).toBe('0 of 0');
	});
});

describe('pageFromSearch', () => {
	it('reads ?page, and falls back to 1', () => {
		expect(pageFromSearch(new URLSearchParams('page=3'))).toBe(3);
		expect(pageFromSearch(new URLSearchParams(''))).toBe(1);
		for (const bad of ['0', '-2', 'x', '1.5', '', '99999999']) {
			expect(pageFromSearch(new URLSearchParams({ page: bad })), bad).toBe(1);
		}
	});
});

describe('matchHeadline', () => {
	it('reads the result from the player’s side', () => {
		expect(matchHeadline(sampleMatch({ viewerSide: 'a' }), TAMSIN)).toBe(
			'You and Oren Quill beat Bea Marlowe and Kit Ashdown'
		);
		expect(matchHeadline(sampleMatch({ viewerSide: 'b' }), BEA)).toBe(
			'You and Kit Ashdown lost to Tamsin Vale and Oren Quill'
		);
	});

	it('reads the tags at the end, as the row shows them', () => {
		const match = sampleMatch({ status: 'confirmed' });
		expect(rowLabel(match, TAMSIN)).toMatch(/ Confirmed\.$/);
		expect(rowLabel(match, TAMSIN, { vouched: true })).toMatch(/ Confirmed\. On hold\.$/);
		expect(rowLabel(viewerMatch(), TAMSIN, { vouched: false })).toMatch(
			/ Needs your confirmation\. Needs your vouch\.$/
		);
	});

	it('says "played" while there is no winner', () => {
		const match = sampleMatch({ games: games([11, 7]), viewerSide: 'a' });
		expect(matchHeadline(match, TAMSIN)).toBe(
			'You and Oren Quill played Bea Marlowe and Kit Ashdown'
		);
	});
});

describe('rowLabel and viewpoint', () => {
	it('reads from the player’s own team', () => {
		const match = sampleMatch({ viewerSide: 'a' });
		const beasMatch = sampleMatch({ viewerSide: 'b' });
		expect(viewpoint(match)).toBe('a');
		expect(viewpoint(beasMatch)).toBe('b');
		expect(rowLabel(match, TAMSIN)).toBe(
			'14 Nov 2026, Doubles, best of 3. Tamsin Vale (you) and Oren Quill beat Bea Marlowe and Kit Ashdown, 11-7, 9-11, 11-4. Pending.'
		);
		expect(rowLabel(beasMatch, BEA)).toBe(
			'14 Nov 2026, Doubles, best of 3. Bea Marlowe (you) and Kit Ashdown lost to Tamsin Vale and Oren Quill, 7-11, 11-9, 4-11. Pending.'
		);
	});

	it('says "played" while there is no winner', () => {
		const match = sampleMatch({ games: games([11, 7]), bestOf: 3, status: 'confirmed' });
		expect(rowLabel(match, TAMSIN)).toContain('Tamsin Vale (you) and Oren Quill played ');
	});

	it("reads the side from the API's viewerSide, not from the codes", () => {
		// TAMSIN is on team A, but the API says the viewer is on side B.
		const match = sampleMatch({ viewerSide: 'b' });
		expect(viewpoint(match)).toBe('b');
		expect(rowLabel(match, TAMSIN)).toContain('Bea Marlowe and Kit Ashdown lost to');
	});

	it('falls back to team A for someone who did not play', () => {
		expect(viewpoint(sampleMatch())).toBe('a');
	});
});

describe('rowTeamNames', () => {
	it('writes "You" for the player and joins with an ampersand, as the mockups do', () => {
		expect(rowTeamNames(team('a', tamsin, oren), TAMSIN)).toBe('You & Oren Quill');
		expect(rowTeamNames(team('b', bea, kit), TAMSIN)).toBe('Bea Marlowe & Kit Ashdown');
		expect(rowTeamNames(team('b', bea), null)).toBe('Bea Marlowe');
	});
});

describe('formatDayMonth', () => {
	it('has the day and month only', () => {
		expect(formatDayMonth('2026-11-14')).toBe('14 Nov');
		expect(formatDayMonth('nope')).toBe('nope');
	});
});

describe('formatShortDate', () => {
	it('has the weekday and no year', () => {
		expect(formatShortDate('2026-11-14')).toBe('Sat 14 Nov');
		expect(formatShortDate('nope')).toBe('nope');
	});
});

describe('matchTags', () => {
	const labels = (...args: Parameters<typeof matchTags>) =>
		matchTags(...args).map((tag) => `${tag.label}:${tag.tone}`);

	it('is the plain status when nothing needs the player', () => {
		expect(labels(sampleMatch())).toEqual(['Pending:pending']);
		expect(labels(viewerMatch({ a: true }))).toEqual(['Pending:pending']);
		expect(labels(sampleMatch({ status: 'confirmed' }))).toEqual(['Confirmed:confirmed']);
		expect(labels(sampleMatch({ status: 'disputed' }))).toEqual(['Disputed:disputed']);
		expect(labels(sampleMatch({ status: 'voided' }))).toEqual(['Voided:voided']);
	});

	it('asks for a confirmation in place of Pending while her team has not confirmed', () => {
		expect(labels(viewerMatch())).toEqual(['Needs your confirmation:action']);
		expect(labels(viewerMatch({ b: true }))).toEqual(['Needs your confirmation:action']);
	});

	it('keeps the status of a held match and adds the hold', () => {
		const confirmed = sampleMatch({ status: 'confirmed', viewerSide: 'a' });
		expect(labels(confirmed, { vouched: false })).toEqual([
			'Confirmed:confirmed',
			'Needs your vouch:action'
		]);
		expect(labels(confirmed, { vouched: true })).toEqual(['Confirmed:confirmed', 'On hold:held']);
		expect(labels(sampleMatch({ status: 'disputed' }), { vouched: true })).toEqual([
			'Disputed:disputed',
			'On hold:held'
		]);
		expect(labels(viewerMatch(), { vouched: false })).toEqual([
			'Needs your confirmation:action',
			'Needs your vouch:action'
		]);
	});

	it('drops the hold of a voided match', () => {
		expect(labels(sampleMatch({ status: 'voided' }), { vouched: false })).toEqual([
			'Voided:voided'
		]);
	});
});

describe('rowPlayers', () => {
	it('names the partner and the opponents in doubles', () => {
		expect(rowPlayers(viewerMatch(), TAMSIN)).toBe('With Oren Quill vs Bea Marlowe & Kit Ashdown');
		expect(rowPlayers(sampleMatch({ viewerSide: 'b' }), BEA)).toBe(
			'With Kit Ashdown vs Tamsin Vale & Oren Quill'
		);
	});

	it('names the opponent in singles', () => {
		const singles = sampleMatch({
			format: 'singles',
			viewerSide: 'a',
			teamA: team('a', tamsin),
			teamB: team('b', bea)
		});
		expect(rowPlayers(singles, TAMSIN)).toBe('Vs Bea Marlowe');
	});

	it('says "Private player" for a private player', () => {
		const match = viewerMatch({}, { teamB: team('b', privatePlayer, kit) });
		expect(rowPlayers(match, TAMSIN)).toBe('With Oren Quill vs Private player & Kit Ashdown');
		const partner = viewerMatch({}, { teamA: team('a', tamsin, privatePlayer) });
		expect(rowPlayers(partner, TAMSIN)).toBe('With Private player vs Bea Marlowe & Kit Ashdown');
	});

	it('names both teams for someone who did not play', () => {
		expect(rowPlayers(sampleMatch(), TAMSIN)).toBe(
			'Tamsin Vale & Oren Quill vs Bea Marlowe & Kit Ashdown'
		);
	});
});

describe('resultWord', () => {
	it('says Won or Lost from her side, and nothing without a side or a winner', () => {
		expect(resultWord(viewerMatch())).toBe('Won');
		expect(resultWord(sampleMatch({ viewerSide: 'b' }))).toBe('Lost');
		expect(resultWord(sampleMatch())).toBeNull();
		expect(resultWord(viewerMatch({}, { games: games([11, 7]) }))).toBeNull();
	});
});
