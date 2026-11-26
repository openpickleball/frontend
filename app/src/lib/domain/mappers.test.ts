import { describe, expect, it } from 'vitest';
import type { components } from '../api/generated/open';
import { buildCode, parsePlayerCode } from './codes';
import {
	MappingError,
	PRIVATE_PLAYER_NAME,
	toGame,
	toHold,
	toHoldPage,
	toMatch,
	toMatchPage,
	toPlayer
} from './mappers';
import { isPending, winner } from './models';

type MatchDto = components['schemas']['MatchOut'];

const samCode = buildCode('player', 'SAM1111');
const alexCode = buildCode('player', 'AJX1111');
const robinCode = buildCode('player', 'RBN1111');
const matchCode = buildCode('match', 'MAT11111111');

function dto(overrides: Partial<MatchDto> = {}): MatchDto {
	return {
		code: matchCode,
		my_team: null,
		my_decision: 'none',
		confirmed_by_team: null,
		created_at: '2026-11-14T18:00:00Z',
		status: 'pending',
		format: 'doubles',
		played_on: '2026-11-14',
		best_of: 3,
		scoring_type: 'side_out',
		game_target: 11,
		team_a: [
			{ code: samCode, display_name: 'Sam Example' },
			{ code: alexCode, display_name: 'Alex Example' }
		],
		team_b: [
			{ code: robinCode, display_name: 'Robin Example' },
			{ code: null, display_name: 'Private player' }
		],
		games: [
			{ number: 1, team_a: 11, team_b: 7 },
			{ number: 2, team_a: 9, team_b: 11 },
			{ number: 3, team_a: 11, team_b: 4 }
		],
		...overrides
	};
}

describe('toPlayer', () => {
	it('parses the code and renames the name', () => {
		const loose = samCode.toLowerCase().replaceAll('-', '');
		expect(toPlayer({ code: loose, display_name: 'Sam' })).toEqual({
			code: samCode,
			displayName: 'Sam'
		});
	});

	it('shows a player with no code as a private player', () => {
		const player = toPlayer({ code: null, display_name: 'Private player' });
		expect(player).toEqual({ code: null, displayName: PRIVATE_PLAYER_NAME });
	});

	it('never keeps a name that arrives with a null code', () => {
		const player = toPlayer({ code: null, display_name: 'Someone Real' });
		expect(player.displayName).toBe('Private player');
		expect(JSON.stringify(player)).not.toContain('Someone');
	});

	it('throws a MappingError for a code that is not an OPEN code', () => {
		expect(() => toPlayer({ code: 'P-AAAA-AAAA', display_name: 'X' })).toThrow(MappingError);
		expect(() => toPlayer({ code: 'nonsense', display_name: 'X' })).toThrow(MappingError);
	});

	it('does not put the bad code in the error message', () => {
		expect(() => toPlayer({ code: 'P-AAAA-AAAA', display_name: 'X' })).toThrow(/invalid OPEN code/);
		try {
			toPlayer({ code: 'P-AAAA-AAAA', display_name: 'X' });
		} catch (error) {
			expect((error as Error).message).not.toContain('AAAA');
		}
	});
});

describe('toGame', () => {
	it('renames the scores', () => {
		expect(toGame({ number: 2, team_a: 9, team_b: 11 })).toEqual({
			number: 2,
			teamA: 9,
			teamB: 11
		});
	});
});

describe('toMatch', () => {
	it('maps my_team A to side a', () => {
		expect(toMatch(dto({ my_team: 'A' })).viewerSide).toBe('a');
	});

	it('carries the viewer fields through', () => {
		const match = toMatch(
			dto({
				my_team: 'B',
				my_decision: 'dispute',
				confirmed_by_team: { a: true, b: false }
			})
		);
		expect(match).toMatchObject({
			viewerSide: 'b',
			viewerDecision: 'dispute',
			confirmedBySide: { a: true, b: false },
			createdAt: '2026-11-14T18:00:00Z'
		});
		expect(toMatch(dto()).viewerSide).toBeNull();
	});

	it('carries a withdrawn dispute through as withdraw', () => {
		expect(toMatch(dto({ my_team: 'A', my_decision: 'withdraw' })).viewerDecision).toBe('withdraw');
	});

	it('renames every field and parses the codes', () => {
		const match = toMatch(dto());
		expect(match.code).toBe(matchCode);
		expect(match).toMatchObject({
			status: 'pending',
			format: 'doubles',
			playedOn: '2026-11-14',
			bestOf: 3,
			scoringType: 'side_out',
			gameTarget: 11
		});
		expect(match.teamA.side).toBe('a');
		expect(match.teamB.side).toBe('b');
		expect(match.teamA.players.map((p) => p.displayName)).toEqual(['Sam Example', 'Alex Example']);
		expect(match.games).toEqual([
			{ number: 1, teamA: 11, teamB: 7 },
			{ number: 2, teamA: 9, teamB: 11 },
			{ number: 3, teamA: 11, teamB: 4 }
		]);
	});

	it('shows the private player as such', () => {
		const match = toMatch(dto());
		expect(match.teamB.players[1]).toEqual({ code: null, displayName: 'Private player' });
	});

	it('works with the derived helpers', () => {
		const match = toMatch(dto());
		const sam = parsePlayerCode(samCode);
		if (!sam.ok) throw new Error('fixture');
		expect(isPending(match)).toBe(true);
		expect(winner(match)).toBe('a');
	});

	it('maps a singles match in every status', () => {
		for (const status of ['pending', 'confirmed', 'disputed', 'voided'] as const) {
			const match = toMatch(
				dto({
					status,
					format: 'singles',
					team_a: [{ code: samCode, display_name: 'Sam' }],
					team_b: [{ code: robinCode, display_name: 'Robin' }],
					games: [{ number: 1, team_a: 11, team_b: 3 }],
					best_of: 1
				})
			);
			expect(match.status).toBe(status);
			expect(match.teamA.players).toHaveLength(1);
		}
	});

	it('throws a MappingError for a bad match code', () => {
		expect(() => toMatch(dto({ code: 'M-AAAA-AAAA-AAAA' }))).toThrow(MappingError);
	});

	it('throws a MappingError for a bad player code inside a team', () => {
		expect(() => toMatch(dto({ team_a: [{ code: 'P-ZZZZ-ZZZZ', display_name: 'X' }] }))).toThrow(
			MappingError
		);
	});
});

describe('toMatchPage', () => {
	it('maps the items and keeps the count', () => {
		const page = toMatchPage({ items: [dto(), dto({ status: 'confirmed' })], count: 47 });
		expect(page.count).toBe(47);
		expect(page.items.map((m) => m.status)).toEqual(['pending', 'confirmed']);
	});

	it('maps an empty page', () => {
		expect(toMatchPage({ items: [], count: 0 })).toEqual({ items: [], count: 0 });
	});
});

describe('toHold', () => {
	it('maps the match and keeps vouched', () => {
		const hold = toHold({ match: dto({ status: 'confirmed', my_team: 'B' }), vouched: true });
		expect(hold.vouched).toBe(true);
		expect(hold.match).toMatchObject({ code: matchCode, status: 'confirmed', viewerSide: 'b' });
	});

	it('maps a hold not vouched for yet, as an organizer sees it', () => {
		const hold = toHold({ match: dto(), vouched: false });
		expect(hold).toMatchObject({ vouched: false, match: { viewerSide: null } });
	});

	it('throws a MappingError for a bad match code', () => {
		expect(() => toHold({ match: dto({ code: 'M-AAAA-AAAA-AAAA' }), vouched: false })).toThrow(
			MappingError
		);
	});
});

describe('toHoldPage', () => {
	it('maps the items and keeps the count', () => {
		const page = toHoldPage({
			items: [
				{ match: dto(), vouched: false },
				{ match: dto({ status: 'confirmed' }), vouched: true }
			],
			count: 3
		});
		expect(page.count).toBe(3);
		expect(page.items.map((h) => [h.match.status, h.vouched])).toEqual([
			['pending', false],
			['confirmed', true]
		]);
	});
});
