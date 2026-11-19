/**
 * Mappers from the API's DTOs (the generated `components['schemas']` types) to the
 * domain models. They rename fields to camelCase and parse codes into branded types.
 * Nothing else: derived values (`winner`, `myTeam`) are functions in `models.ts`.
 *
 * Only `import type` from `api/generated` is allowed here (proposal.md, section 3).
 *
 * Privacy: the API sends a private player (an inactive account) as `code: null`. The
 * mapper shows such a player as "Private player" whatever name arrives with a null
 * code, so a name can never leak through a missing code.
 *
 * A code the API sends that is not a valid OPEN code is a broken contract, not user
 * input. The mappers throw a `MappingError` for it instead of guessing.
 */
import type { components } from '../api/generated/open';
import { parseMatchCode, parsePlayerCode } from './codes';
import type { Game, Match, Player, Team } from './models';

type Schemas = components['schemas'];

export type MatchDto = Schemas['MatchOut'];
export type ParticipantDto = Schemas['ParticipantOut'];
export type GameDto = Schemas['GameOut'];
export type PagedMatchDto = Schemas['PagedMatchOut'];

/** What a player is called when the API hides them. Matches the backend's `PRIVATE_PLAYER_NAME`. */
export const PRIVATE_PLAYER_NAME = 'Private player';

/** The API sent something the app cannot read. This is a bug on one side, not a user mistake. */
export class MappingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'MappingError';
	}
}

/** One page of matches: the domain matches and the total across all pages. */
export type MatchPage = {
	items: Match[];
	count: number;
};

export function toPlayer(dto: ParticipantDto): Player {
	if (dto.code === null) {
		return { code: null, displayName: PRIVATE_PLAYER_NAME };
	}
	const code = parsePlayerCode(dto.code);
	if (!code.ok) throw new MappingError('The API sent a player with an invalid OPEN code.');
	return { code: code.value, displayName: dto.display_name };
}

export function toGame(dto: GameDto): Game {
	return { number: dto.number, teamA: dto.team_a, teamB: dto.team_b };
}

export function toMatch(dto: MatchDto): Match {
	const code = parseMatchCode(dto.code);
	if (!code.ok) throw new MappingError('The API sent a match with an invalid OPEN code.');
	const team = (side: Team['side'], players: readonly ParticipantDto[]): Team => ({
		side,
		players: players.map(toPlayer)
	});
	return {
		code: code.value,
		status: dto.status,
		format: dto.format,
		playedOn: dto.played_on,
		bestOf: dto.best_of,
		scoringType: dto.scoring_type,
		gameTarget: dto.game_target,
		teamA: team('a', dto.team_a),
		teamB: team('b', dto.team_b),
		games: dto.games.map(toGame),
		viewerSide: dto.my_team === null ? null : dto.my_team === 'A' ? 'a' : 'b',
		viewerDecision: dto.my_decision,
		confirmedBySide: dto.confirmed_by_team,
		createdAt: dto.created_at
	};
}

export function toMatchPage(dto: PagedMatchDto): MatchPage {
	return { items: dto.items.map(toMatch), count: dto.count };
}
