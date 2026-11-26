import {
	GAME_TARGETS,
	MATCH_FORMATS,
	MAX_GAMES,
	SCORING_TYPES,
	parsePlayerCode,
	type GameTarget,
	type Match,
	type MatchFormat,
	type PlayerCode,
	type ScoringType
} from '#lib/domain/index.js';

/**
 * The "Record a match" form kept in `sessionStorage`, so a reload or a stray tap on the bottom nav
 * does not lose what the player typed. It lives only as long as the browser tab, and the key ends
 * in the player's own OPEN code, so another account on the device never sees it. Bump `VERSION`
 * if the stored value changes shape.
 */
const VERSION = 'v1';
const PREFIX = `open:${VERSION}:record-draft:`;

/** One player slot, as kept: the checked code and the name it was found under, if any. */
export type DraftSlot = { code: PlayerCode | null; name: string };

/** What the form holds. Codes still being typed are not kept, only chips and scores. */
export type Draft = {
	format: MatchFormat;
	playedOn: string;
	gameTarget: GameTarget;
	scoringType: ScoringType;
	partner: DraftSlot;
	opponents: [DraftSlot, DraftSlot];
	games: { a: string; b: string }[];
};

/** The part of `Storage` this file uses. */
export type DraftStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type DraftStore = {
	read(own: string): Draft | null;
	write(own: string, draft: Draft): void;
	clear(own: string): void;
};

export const draftKey = (own: string): string => PREFIX + own;

function browserStorage(): DraftStorage | null {
	try {
		return typeof sessionStorage === 'undefined' ? null : sessionStorage;
	} catch {
		// Access can throw when site data is blocked.
		return null;
	}
}

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null;

function slotOf(value: unknown): DraftSlot | null {
	if (!isObject(value)) return null;
	if (value.code === null) return { code: null, name: '' };
	if (typeof value.code !== 'string') return null;
	const parsed = parsePlayerCode(value.code);
	if (!parsed.ok) return null;
	const name = typeof value.name === 'string' ? value.name.slice(0, 200) : '';
	return { code: parsed.value, name };
}

const oneOf = <T extends string | number>(list: readonly T[], value: unknown): value is T =>
	(list as readonly unknown[]).includes(value);

/** A stored value as a draft, or null if it is not one. Stored text is never trusted. */
export function parseDraft(raw: unknown): Draft | null {
	if (!isObject(raw)) return null;
	const { format, gameTarget, scoringType, playedOn, partner, opponents, games } = raw;
	if (!oneOf(MATCH_FORMATS, format) || !oneOf(GAME_TARGETS, gameTarget)) return null;
	if (!oneOf(SCORING_TYPES, scoringType)) return null;
	if (typeof playedOn !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(playedOn)) return null;
	if (!Array.isArray(opponents) || opponents.length !== 2) return null;
	if (!Array.isArray(games) || games.length < 1 || games.length > MAX_GAMES) return null;
	const partnerSlot = slotOf(partner);
	const first = slotOf(opponents[0]);
	const second = slotOf(opponents[1]);
	if (!partnerSlot || !first || !second) return null;
	const rows: { a: string; b: string }[] = [];
	for (const game of games) {
		if (!isObject(game) || typeof game.a !== 'string' || typeof game.b !== 'string') return null;
		rows.push({ a: game.a.slice(0, 3), b: game.b.slice(0, 3) });
	}
	return {
		format,
		playedOn,
		gameTarget,
		scoringType,
		partner: partnerSlot,
		opponents: [first, second],
		games: rows
	};
}

/** A draft store over `sessionStorage`, or over `storage` in tests. Never throws. */
export function createDraftStore(storage?: () => DraftStorage | null): DraftStore {
	const get = storage ?? browserStorage;
	return {
		read(own) {
			try {
				const raw = get()?.getItem(draftKey(own));
				return raw ? parseDraft(JSON.parse(raw)) : null;
			} catch {
				return null;
			}
		},
		write(own, draft) {
			try {
				get()?.setItem(draftKey(own), JSON.stringify(draft));
			} catch {
				// A full or blocked store only means the draft is not kept.
			}
		},
		clear(own) {
			try {
				get()?.removeItem(draftKey(own));
			} catch {
				// Nothing to clean up.
			}
		}
	};
}

/** True when nothing worth keeping has been entered, so the draft can be dropped. */
export function isBlank(draft: Draft, today: string): boolean {
	return (
		draft.format === 'doubles' &&
		draft.gameTarget === 11 &&
		draft.scoringType === 'side_out' &&
		draft.playedOn === today &&
		!draft.partner.code &&
		!draft.opponents[0].code &&
		!draft.opponents[1].code &&
		draft.games.length === 1 &&
		draft.games[0].a === '' &&
		draft.games[0].b === ''
	);
}

/** A draft store that keeps nothing. A correction starts from its match each time. */
export const noDrafts: DraftStore = { read: () => null, write: () => {}, clear: () => {} };

/**
 * The form's starting values for correcting `match`, from `own`'s side: their partner on their
 * team, the other team as opponents, and each game's points with their team's first. Null when
 * `own` did not play in the match, or a player in it is private: the API gives no code for a
 * private player, and a correction must name the same players.
 */
export function correctionDraft(match: Match, own: PlayerCode): Draft | null {
	const mine = [match.teamA, match.teamB].find((team) =>
		team.players.some((player) => player.code === own)
	);
	if (!mine) return null;
	const theirs = mine === match.teamA ? match.teamB : match.teamA;
	const players = [...match.teamA.players, ...match.teamB.players];
	if (players.some((player) => player.code === null)) return null;
	const slot = (player: { code: PlayerCode | null; displayName: string } | undefined) =>
		player ? { code: player.code, name: player.displayName } : { code: null, name: '' };
	const partner = mine.players.find((player) => player.code !== own);
	const flip = mine.side === 'b';
	return {
		format: match.format,
		playedOn: match.playedOn,
		gameTarget: match.gameTarget,
		scoringType: match.scoringType,
		partner: slot(partner),
		opponents: [slot(theirs.players[0]), slot(theirs.players[1])],
		games: match.games.map((game) => ({
			a: String(flip ? game.teamB : game.teamA),
			b: String(flip ? game.teamA : game.teamB)
		}))
	};
}
