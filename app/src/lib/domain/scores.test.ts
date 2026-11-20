/**
 * Ported from backend `apps/matches/tests/test_validation.py`,
 * `test_validation_malformed_containers.py`, `test_validation_too_many_games.py`
 * and `test_validation_mixed_references.py` (the part that applies here). Test
 * names in the backend are in the comments. Codes are made up.
 */
import { describe, expect, it } from 'vitest';
import { buildCode } from './codes';
import { MAX_GAMES } from './models';
import {
	groupIssues,
	inferBestOf,
	latestPlayableDate,
	todayLocal,
	validateGame,
	validateMatch,
	type Issue,
	type MatchDraft
} from './scores';

// Four made-up players. Their codes use the real format and check character.
const A1 = buildCode('player', 'AAAA111');
const A2 = buildCode('player', 'AAAA222');
const B1 = buildCode('player', 'BBBB111');
const B2 = buildCode('player', 'BBBB222');
const B3 = buildCode('player', 'BBBB333');

const SINGLES_A = [A1];
const SINGLES_B = [B1];
const DOUBLES_A = [A1, A2];
const DOUBLES_B = [B1, B2];

// The backend freezes its clock at this moment.
const NOW = new Date('2026-06-15T12:00:00Z');
const PAST = '2026-06-01';

const g = (teamA: number, teamB: number) => ({ teamA, teamB });
const games = (...scores: [number, number][]) => scores.map(([a, b]) => g(a, b));

function draft(overrides: Partial<Record<keyof MatchDraft, unknown>> = {}): MatchDraft {
	return {
		format: 'singles',
		teamA: SINGLES_A,
		teamB: SINGLES_B,
		games: games([11, 5]),
		playedOn: PAST,
		...overrides
	};
}

function validate(overrides: Partial<Record<keyof MatchDraft, unknown>> = {}, now = NOW) {
	return validateMatch(draft(overrides), now);
}

function issuesOf(overrides: Partial<Record<keyof MatchDraft, unknown>> = {}, now = NOW): Issue[] {
	const result = validate(overrides, now);
	if (result.ok) throw new Error('expected the match to fail');
	expect(result.error.length).toBeGreaterThan(0);
	return result.error;
}

const pairs = (issues: Issue[]) => issues.map((issue) => [issue.field, issue.code]);

function codesOf(overrides: Partial<Record<keyof MatchDraft, unknown>> = {}, now = NOW) {
	return new Set(issuesOf(overrides, now).map((issue) => `${issue.field}:${issue.code}`));
}

/** The numbers a message may contain: game numbers, the win margin and the allowed choices. */
const SAFE_NUMBERS = new Set([1, 2, 3, 4, 5, 11, 15, 21]);

function expectNoLeakedNumber(message: string) {
	for (const found of message.match(/\d+/g) ?? []) {
		expect(SAFE_NUMBERS.has(Number(found)), message).toBe(true);
	}
}

// Criteria 1 and 7: single games at each target, best of 1 (GAME_TABLE).
const GAME_TABLE: [number, [number, number], string | null][] = [
	[11, [11, 9], null],
	[11, [9, 11], null],
	[11, [11, 0], null],
	[11, [13, 11], null],
	[11, [11, 10], 'not_won_by_two'],
	[11, [12, 9], 'played_past_target'],
	[11, [14, 11], 'played_past_target'],
	[11, [10, 8], 'target_not_reached'],
	[11, [11, 11], 'tie'],
	[11, [0, 0], 'tie'],
	[15, [15, 13], null],
	[15, [17, 15], null],
	[15, [15, 14], 'not_won_by_two'],
	[15, [14, 12], 'target_not_reached'],
	[15, [18, 15], 'played_past_target'],
	[21, [21, 19], null],
	[21, [23, 21], null],
	[21, [21, 20], 'not_won_by_two'],
	[21, [20, 18], 'target_not_reached'],
	[21, [24, 21], 'played_past_target']
];

describe('game scores (test_game_scores)', () => {
	describe.each(['side_out', 'rally'])('%s scoring', (scoringType) => {
		it.each(GAME_TABLE)('target %i, score %j -> %s', (target, score, code) => {
			const overrides = {
				games: games(score),
				bestOf: 1,
				gameTarget: target,
				scoringType
			};
			if (code === null) {
				const result = validate(overrides);
				expect(result.ok && result.value.games).toEqual(games(score));
			} else {
				const issues = issuesOf(overrides);
				expect(pairs(issues)).toEqual([['games.0', code]]);
				expect(issues.every((issue) => issue.message.includes('Game 1'))).toBe(true);
				expect(issues[0].message).not.toContain(`${score[0]}-${score[1]}`);
			}
		});
	});

	// test_scoring_type_does_not_change_the_game_rules (criterion 5)
	it.each(GAME_TABLE)(
		'scoring type does not change the outcome: target %i, %j',
		(target, score) => {
			const outcome = (scoringType: string) => {
				const result = validate({
					games: games(score),
					bestOf: 1,
					gameTarget: target,
					scoringType
				});
				return result.ok ? null : pairs(result.error);
			};
			expect(outcome('side_out')).toEqual(outcome('rally'));
		}
	);
});

describe('validateGame', () => {
	it('returns the scores for a good game', () => {
		expect(validateGame(g(11, 9), 11)).toEqual({ ok: true, value: g(11, 9) });
	});

	it('keys the issue by the 0-based game index and words it by the 1-based number', () => {
		const result = validateGame(g(11, 10), 11, 2);
		expect(result).toMatchObject({
			ok: false,
			error: {
				field: 'games.2',
				code: 'not_won_by_two',
				message: 'Game 3: the winner must win by 2 points.'
			}
		});
	});

	it('skips the target rules without a target but keeps the rest', () => {
		expect(validateGame(g(3, 1), null).ok).toBe(true);
		expect(validateGame(g(3, 3), null)).toMatchObject({ error: { code: 'tie' } });
		expect(validateGame(g(-1, 3), null)).toMatchObject({ error: { code: 'negative_score' } });
	});
});

// Criterion 2: teams (test_teams).
describe('teams', () => {
	const cases: [string, string, string[], string[], string[]][] = [
		['singles', 'singles', SINGLES_A, SINGLES_B, []],
		['doubles', 'doubles', DOUBLES_A, DOUBLES_B, []],
		['singles with a doubles team A', 'singles', DOUBLES_A, SINGLES_B, ['team_a:team_size']],
		['singles with a doubles team B', 'singles', SINGLES_A, DOUBLES_B, ['team_b:team_size']],
		['singles with an empty team A', 'singles', [], SINGLES_B, ['team_a:team_size']],
		['doubles with a singles team A', 'doubles', SINGLES_A, DOUBLES_B, ['team_a:team_size']],
		['doubles with three on team B', 'doubles', DOUBLES_A, [B1, B2, B3], ['team_b:team_size']],
		[
			'doubles with a repeat on team A',
			'doubles',
			[A1, A1],
			DOUBLES_B,
			['team_a:duplicate_player']
		],
		[
			'doubles with a repeat on team B',
			'doubles',
			DOUBLES_A,
			[B1, B1],
			['team_b:duplicate_player']
		],
		[
			'doubles with a player on both teams',
			'doubles',
			DOUBLES_A,
			[A2, B2],
			['team_b:player_on_both_teams']
		],
		[
			'singles with the same player twice',
			'singles',
			SINGLES_A,
			SINGLES_A,
			['team_b:player_on_both_teams']
		]
	];
	it.each(cases)('%s', (_name, format, teamA, teamB, expected) => {
		const overrides = { format, teamA, teamB };
		if (expected.length === 0) {
			const result = validate(overrides);
			expect(result.ok && result.value.format).toBe(format);
			expect(result.ok && result.value.teamA).toEqual(teamA);
			expect(result.ok && result.value.teamB).toEqual(teamB);
		} else {
			expect(codesOf(overrides)).toEqual(new Set(expected));
		}
	});

	it('normalizes codes, so two spellings of one player count as one', () => {
		const loose = A1.toLowerCase().replaceAll('-', ' ');
		expect(codesOf({ format: 'doubles', teamA: [A1, loose], teamB: DOUBLES_B })).toEqual(
			new Set(['team_a:duplicate_player'])
		);
		expect(codesOf({ teamA: SINGLES_A, teamB: [loose] })).toEqual(
			new Set(['team_b:player_on_both_teams'])
		);
	});

	it('returns normalized codes', () => {
		const result = validate({ teamA: [A1.toLowerCase()], teamB: [B1.replaceAll('-', '')] });
		expect(result.ok && [result.value.teamA, result.value.teamB]).toEqual([[A1], [B1]]);
	});

	it('flags a code that is not a player code at team_a.<i>', () => {
		const issues = issuesOf({ format: 'doubles', teamA: [A1, 'P-7K3M-QX9J'], teamB: DOUBLES_B });
		expect(pairs(issues)).toEqual([['team_a.1', 'invalid_code']]);
		expect(issues[0].message).not.toContain('QX9J');
	});

	it('flags a match code given as a player', () => {
		expect(codesOf({ teamB: ['M-9QF6-RD2K-X3BP'] })).toEqual(new Set(['team_b.0:invalid_code']));
	});

	// test_an_unknown_format_fails_and_skips_the_team_size_check
	it('skips the team size check for an unknown format', () => {
		const issues = issuesOf({ format: 'triples', teamA: DOUBLES_A, teamB: SINGLES_B });
		expect(pairs(issues)).toEqual([['format', 'invalid_choice']]);
		expect(issues[0].message).toBe('Choose a format of singles or doubles.');
		expect(issues[0].message).not.toContain('triples');
	});
});

// backend: test_validation_malformed_containers.py
describe('malformed teams and games', () => {
	// test_a_team_that_is_not_a_list_or_tuple_fails
	it.each([
		['null team A', { teamA: null }, ['team_a:invalid']],
		['null team B', { teamB: null }, ['team_b:invalid']],
		['number', { teamA: 7 }, ['team_a:invalid']],
		['object', { teamA: { x: A1 } }, ['team_a:invalid']],
		['both null', { teamA: null, teamB: null }, ['team_a:invalid', 'team_b:invalid']],
		// A string is not read as one player per character.
		[
			'strings in doubles',
			{ format: 'doubles', teamA: 'ab', teamB: 'cd' },
			['team_a:invalid', 'team_b:invalid']
		],
		['one-character strings', { teamA: 'a', teamB: 'b' }, ['team_a:invalid', 'team_b:invalid']],
		['bytes', { teamA: new Uint8Array([97]) }, ['team_a:invalid']]
	])('%s', (_name, overrides, expected) => {
		expect(codesOf(overrides)).toEqual(new Set(expected));
	});

	// test_a_player_that_is_unhashable_or_none_fails
	it.each([
		['an object', { teamA: [{ x: 1 }] }, ['team_a:invalid_player']],
		['an array', { teamA: [[A1]] }, ['team_a:invalid_player']],
		['null', { teamA: [null] }, ['team_a:invalid_player']],
		['null on team B', { teamB: [null] }, ['team_b:invalid_player']],
		[
			'two bad entries and a repeat across teams',
			{ format: 'doubles', teamA: [A1, { x: 1 }, { x: 1 }], teamB: [A1, B2] },
			['team_a:invalid_player']
		]
	])('a player that is %s fails', (_name, overrides, expected) => {
		expect(codesOf(overrides)).toEqual(new Set(expected));
	});

	// test_games_that_are_not_a_list_or_tuple_fail
	it.each([null, undefined, { 0: g(11, 5) }, '11-5', 11])('games %j is not a list', (value) => {
		expect(codesOf({ games: value })).toEqual(new Set(['games:invalid']));
	});

	// test_malformed_games_skip_inference_and_decision
	it('skips inference and the decision check for malformed games', () => {
		expect(codesOf({ games: null, bestOf: 3 })).toEqual(new Set(['games:invalid']));
	});
});

// Criterion 3: best-of values.
describe('best of', () => {
	// test_allowed_best_of_values_pass
	it.each([
		[1, games([11, 5])],
		[3, games([11, 5], [11, 7])],
		[5, games([11, 5], [11, 7], [11, 3])]
	])('best of %i passes', (bestOf, scores) => {
		const result = validate({ bestOf, games: scores });
		expect(result.ok && result.value.bestOf).toBe(bestOf);
	});

	// test_other_best_of_values_fail (3.0 is the integer 3 in JavaScript, so it is left out)
	it.each([0, 2, 4, 7, true, '3', -1, NaN])('best of %j fails', (bestOf) => {
		const issues = issuesOf({ bestOf });
		expect(pairs(issues)).toEqual([['best_of', 'invalid_choice']]);
		expect(issues[0].message).toBe('Choose a best-of of 1, 3, or 5.');
	});
});

// Criterion 4: games that decide the match.
describe('games that decide the match', () => {
	// test_best_of_3_with_one_game_is_not_decided
	it('best of 3 with one game is not decided', () => {
		expect(codesOf({ bestOf: 3, games: games([11, 5]) })).toEqual(new Set(['games:not_decided']));
	});

	// test_best_of_3_with_a_game_after_the_match_was_decided_fails
	it('best of 3 with a game after the decision fails', () => {
		const issues = issuesOf({ bestOf: 3, games: games([11, 5], [11, 7], [11, 3]) });
		expect(pairs(issues)).toEqual([['games.2', 'game_after_decided']]);
		expect(issues[0].message).toContain('Game 3');
	});

	// test_only_the_first_game_after_the_decision_is_reported
	it('reports only the first game after the decision', () => {
		const issues = issuesOf({ bestOf: 1, games: games([11, 5], [11, 7], [11, 3]) });
		expect(pairs(issues)).toEqual([['games.1', 'game_after_decided']]);
	});

	// test_best_of_5_decided_in_game_4_passes
	it('best of 5 decided in game 4 passes', () => {
		const scores = games([11, 5], [9, 11], [11, 7], [11, 6]);
		const result = validate({ bestOf: 5, games: scores });
		expect(result.ok && result.value.games).toEqual(scores);
		expect(result.ok && result.value.bestOf).toBe(5);
	});

	// test_best_of_5_won_by_team_b_passes
	it('best of 5 won by team B passes', () => {
		const result = validate({ bestOf: 5, games: games([5, 11], [11, 9], [7, 11], [11, 13]) });
		expect(result.ok && result.value.bestOf).toBe(5);
	});
});

// Criterion 6: game targets.
describe('game targets', () => {
	// test_allowed_game_targets_pass
	describe.each(['side_out', 'rally'])('%s', (scoringType) => {
		it.each([11, 15, 21])('target %i passes', (target) => {
			const result = validate({ games: games([target, 3]), gameTarget: target, scoringType });
			expect(result.ok && result.value.gameTarget).toBe(target);
			expect(result.ok && result.value.scoringType).toBe(scoringType);
		});

		// test_other_game_targets_fail (11.0 is the integer 11 in JavaScript, so it is left out)
		it.each([9, 25, 0, true, '11'])('target %j fails', (target) => {
			const issues = issuesOf({ gameTarget: target, scoringType });
			expect(pairs(issues)).toEqual([['game_target', 'invalid_choice']]);
			expect(issues[0].message).toBe('Choose a game target of 11, 15, or 21.');
		});
	});

	// test_an_invalid_target_skips_the_target_rules_but_keeps_the_others
	it('an invalid target skips the target rules but keeps the others', () => {
		expect(codesOf({ gameTarget: 25, games: games([11, 11]) })).toEqual(
			new Set(['game_target:invalid_choice', 'games.0:tie'])
		);
	});

	// test_unknown_scoring_types_fail
	it.each(['', 'Rally', 'points', 1])('scoring type %j fails', (scoringType) => {
		const issues = issuesOf({ scoringType });
		expect(pairs(issues)).toEqual([['scoring_type', 'invalid_choice']]);
		expect(issues[0].message).toContain('side-out');
		expect(issues[0].message).toContain('rally');
		expect(issues[0].message).not.toContain('points');
	});
});

// Criterion 8: defaults and inference.
describe('defaults and inference', () => {
	// test_defaults_are_target_11_and_side_out
	it('defaults to target 11 and side-out', () => {
		expect(validate()).toEqual({
			ok: true,
			value: {
				format: 'singles',
				teamA: SINGLES_A,
				teamB: SINGLES_B,
				games: games([11, 5]),
				playedOn: PAST,
				bestOf: 1,
				gameTarget: 11,
				scoringType: 'side_out'
			}
		});
	});

	it('treats null like a missing choice', () => {
		const result = validate({ bestOf: null, gameTarget: null, scoringType: null });
		expect(
			result.ok && [result.value.bestOf, result.value.gameTarget, result.value.scoringType]
		).toEqual([1, 11, 'side_out']);
	});

	// test_a_missing_target_means_11
	it('a missing target means 11', () => {
		expect(codesOf({ games: games([15, 3]) })).toEqual(new Set(['games.0:played_past_target']));
	});

	// test_best_of_is_inferred_when_absent
	it.each([
		[games([11, 5]), 1],
		[games([5, 11]), 1],
		[games([11, 5], [11, 7]), 3],
		[games([11, 5], [5, 11], [11, 3]), 3],
		[games([11, 5], [11, 7], [11, 3]), 5],
		[games([11, 5], [5, 11], [5, 11], [11, 3], [11, 2]), 5]
	])('infers the best of for %j', (scores, expected) => {
		const result = validate({ games: scores });
		expect(result.ok && result.value.bestOf).toBe(expected);
	});

	// test_best_of_cannot_be_inferred_when_no_value_fits
	it.each([[games([11, 5], [5, 11])], [games([11, 5], [5, 11], [11, 3], [3, 11])]])(
		'cannot infer the best of for %j',
		(scores) => {
			const issues = issuesOf({ games: scores });
			expect(pairs(issues)).toEqual([['best_of', 'cannot_infer']]);
			expect(issues[0].message).toBe('The games do not decide a best of 1, 3, or 5 match.');
		}
	);

	// test_infer_best_of
	it.each([
		[['a'], 1],
		[['b', 'b'], 3],
		[['a', 'b', 'b'], 3],
		[['a', 'a', 'a'], 5],
		[['a', 'b', 'a', 'b', 'a'], 5],
		[['a', 'b'], null],
		[[], null],
		[['a', 'a', 'a', 'a', 'a', 'a'], null]
	] as const)('inferBestOf(%j) is %s', (winners, expected) => {
		expect(inferBestOf(winners)).toBe(expected);
	});
});

// Criterion 9: score types.
describe('score types', () => {
	// test_scores_must_be_non_negative_whole_numbers (11.0 is the integer 11 in JavaScript)
	it.each([
		[g(-1, 11), 'negative_score'],
		[g(11, -3), 'negative_score'],
		[g(11.5, 5), 'invalid_score'],
		[{ teamA: 11, teamB: '5' }, 'invalid_score'],
		[{ teamA: true, teamB: false }, 'invalid_score'],
		[{ teamA: 11, teamB: null }, 'invalid_score'],
		[{ teamA: 11, teamB: NaN }, 'invalid_score'],
		[{ teamA: Infinity, teamB: 5 }, 'invalid_score'],
		[g(7, 7), 'tie']
	])('score %j -> %s', (score, code) => {
		const issues = issuesOf({ games: [score] });
		expect(pairs(issues)).toEqual([['games.0', code]]);
		expect(issues[0].message).toContain('Game 1');
	});

	// test_a_game_that_is_not_a_pair_of_scores_fails
	it.each([{ teamA: 11 }, [11, 5], '11-5', null, 11, {}])(
		'game %j is not a pair of scores',
		(game) => {
			expect(codesOf({ games: [game] })).toEqual(new Set(['games.0:invalid_score']));
		}
	);

	// test_each_bad_game_is_reported_by_its_number
	it('reports each bad game by its number', () => {
		const issues = issuesOf({ bestOf: 3, games: games([11, 5], [11, 10], [12, 3]) });
		expect(pairs(issues)).toEqual([
			['games.1', 'not_won_by_two'],
			['games.2', 'played_past_target']
		]);
		expect(issues[0].message).toContain('Game 2');
		expect(issues[1].message).toContain('Game 3');
	});
});

// Criterion 10: game count.
describe('game count', () => {
	// test_zero_games_fail
	it('zero games fail', () => {
		expect(codesOf({ games: [] })).toEqual(new Set(['games:no_games']));
	});

	// test_more_than_max_games_fail
	it('more than the maximum fail', () => {
		const scores = Array.from({ length: MAX_GAMES + 1 }, (_, i) => (i % 2 ? g(5, 11) : g(11, 5)));
		expect(scores).toHaveLength(6);
		expect(codesOf({ games: scores, bestOf: 5 })).toEqual(new Set(['games:too_many_games']));
	});

	// test_max_games_pass
	it('the maximum passes', () => {
		const scores = games([11, 5], [5, 11], [11, 5], [5, 11], [11, 5]);
		expect(scores).toHaveLength(MAX_GAMES);
		const result = validate({ games: scores, bestOf: 5 });
		expect(result.ok && result.value.games).toEqual(scores);
	});

	// test_too_many_games_is_the_only_games_issue
	it.each([
		[Array<unknown>(10_000).fill(null)],
		[Array<unknown>(MAX_GAMES + 1).fill(g(11, 11))],
		[[g(11, 5), g(-1, 11), g(12, 9), g(11, 10), { teamA: 'x', teamB: 1 }, g(11, 5)]]
	])('too many games is the only games issue (%#)', (scores) => {
		expect(pairs(issuesOf({ games: scores }))).toEqual([['games', 'too_many_games']]);
	});
});

describe('todayLocal', () => {
	it('uses the local calendar date, padded', () => {
		expect(todayLocal(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
		expect(todayLocal(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
	});

	it('never runs ahead of the latest playable date', () => {
		expect(todayLocal(NOW) <= latestPlayableDate(NOW)).toBe(true);
	});
});

// Criterion 11: the date played.
describe('date played', () => {
	// test_the_latest_local_date_on_earth_passes
	it('the latest local date on Earth passes', () => {
		const latest = latestPlayableDate(NOW);
		expect(latest).toBe('2026-06-16');
		const result = validate({ playedOn: latest });
		expect(result.ok && result.value.playedOn).toBe(latest);
	});

	// test_the_day_after_the_latest_local_date_fails
	it('the day after the latest local date fails', () => {
		const issues = issuesOf({ playedOn: '2026-06-17' });
		expect(pairs(issues)).toEqual([['played_on', 'future_date']]);
		expect(issues[0].message).not.toContain('2026');
	});

	// test_the_future_check_uses_utc: 23:30 on June 15 at UTC-12 is 11:30 on June 16 in UTC,
	// so the latest local date anywhere (UTC+14) is June 17.
	it('the future check uses UTC', () => {
		const local = new Date('2026-06-15T23:30:00-12:00');
		expect(validate({ playedOn: '2026-06-17' }, local).ok).toBe(true);
		expect(codesOf({ playedOn: '2026-06-18' }, local)).toEqual(new Set(['played_on:future_date']));
	});

	// test_played_on_must_be_a_date (the backend passes a datetime, a string and None)
	it.each([
		['2026-06-01T00:00:00Z'],
		['06/01/2026'],
		['2026-6-1'],
		['2026-02-30'],
		['2026-13-01'],
		['0000-01-01'],
		[''],
		[null],
		[undefined],
		[new Date('2026-06-01')],
		[20260601]
	])('%j is not a date', (playedOn) => {
		const issues = issuesOf({ playedOn });
		expect(pairs(issues)).toEqual([['played_on', 'invalid']]);
	});

	it('accepts a leap day and refuses one in a common year', () => {
		expect(validate({ playedOn: '2024-02-29' }).ok).toBe(true);
		expect(codesOf({ playedOn: '2025-02-29' })).toEqual(new Set(['played_on:invalid']));
	});
});

// Criterion 13: every issue at once, and no submitted value in a message.
describe('all issues together', () => {
	// test_every_issue_is_reported_together
	it('reports every issue together', () => {
		const issues = issuesOf({
			format: 'doubles',
			teamA: [A1, A1],
			teamB: [A1],
			games: games([11, 10], [-2, 11]),
			playedOn: '2027-01-01',
			bestOf: 7,
			gameTarget: 11,
			scoringType: 'rally'
		});
		expect(new Set(issues.map((issue) => `${issue.field}:${issue.code}`))).toEqual(
			new Set([
				'team_a:duplicate_player',
				'team_b:team_size',
				'team_b:player_on_both_teams',
				'games.0:not_won_by_two',
				'games.1:negative_score',
				'played_on:future_date',
				'best_of:invalid_choice'
			])
		);
		for (const issue of issues) {
			expect(issue.message).not.toContain(A1);
			expectNoLeakedNumber(issue.message);
		}
	});

	it('never puts a submitted number in a message', () => {
		for (const issue of issuesOf({
			games: games([12, 9], [999, 3], [-77, 4]),
			gameTarget: 11,
			bestOf: 6
		})) {
			expectNoLeakedNumber(issue.message);
		}
	});
});

describe('groupIssues', () => {
	it('groups messages by field key', () => {
		const grouped = groupIssues(
			issuesOf({ bestOf: 3, games: games([11, 10], [12, 3]), playedOn: 'x' })
		);
		expect(Object.keys(grouped).sort()).toEqual(['games.0', 'games.1', 'played_on']);
		expect(grouped['games.0']).toHaveLength(1);
	});

	it('keeps several messages for one field', () => {
		expect(
			groupIssues([
				{ field: 'a', code: 'x', message: 'one' },
				{ field: 'a', code: 'y', message: 'two' }
			])
		).toEqual({ a: ['one', 'two'] });
	});
});
