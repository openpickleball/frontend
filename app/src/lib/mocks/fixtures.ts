/**
 * Made-up data for the mocks. Every name, email, code and score here is invented.
 * Never put a real player here (CONTRIBUTING.md).
 *
 * Codes are built with the domain's `buildCode`, so they pass the same check as the
 * backend's. All emails use example.com.
 *
 * Logins (all use `MOCK_PASSWORD`):
 * - `player@example.com`: verified, owns Tamsin Vale, the "you" of the mockups.
 * - `unverified@example.com`: has not verified its email and has no player yet.
 * - `<first name>@example.com` for the other players, so you can sign in as the
 *   other side of a match and confirm it.
 */
import { ALPHABET, buildCode } from '../domain/codes';
import type { components } from '../api/generated/open';
import type { PlayerRatingsOut } from '../api/provisional';

type PrivacyOut = components['schemas']['PrivacyOut'];

/**
 * MOCK ONLY. Not a real password: it exists so the mock login has something to check.
 * Never use a value like this anywhere real.
 */
export const MOCK_PASSWORD = 'mock-only-pass-1234';

/** Keys the mock accepts without any mail having been sent, so deep links work. */
export const MOCK_KEYS = {
	/** Verifies `unverified@example.com`. */
	verifyEmail: 'mock-verify-key',
	/** Resets the password of `player@example.com`. */
	resetPassword: 'mock-reset-key'
} as const;

export const VERIFIED_EMAIL = 'player@example.com';
export const UNVERIFIED_EMAIL = 'unverified@example.com';

export type PlayerKey = 'tamsin' | 'oren' | 'bea' | 'kit' | 'rosa' | 'idris' | 'nell' | 'saul';

export type FixtureAccount = {
	email: string;
	password: string;
	verified: boolean;
	/** An inactive account's player shows as "Private player" to everyone else. */
	active: boolean;
};

export type FixturePlayer = {
	key: PlayerKey;
	code: string;
	displayName: string;
	accountEmail: string | null;
	/** Empty when the player gave none, as the backend stores it. */
	legalName: string;
	birthYear: number;
	birthMonth: number;
	genderDivision: 'mens' | 'womens';
	city: string;
	region: string;
	privacy: PrivacyOut;
};

const signedIn: PrivacyOut = {
	city_region_visibility: 'signed_in',
	match_history_visibility: 'signed_in',
	rating_history_visibility: 'signed_in',
	stats_visibility: 'signed_in',
	home_club_visibility: 'signed_in',
	rating_visibility: 'signed_in'
};

type Profile = {
	born: readonly [year: number, month: number];
	division: 'mens' | 'womens';
	/** City and region, or empty. */
	place?: readonly [city: string, region: string];
	/** The legal name, when it differs from the display name. Empty when left out. */
	legalName?: string;
};

function player(
	key: PlayerKey,
	random: string,
	displayName: string,
	profile: Profile,
	privacy: PrivacyOut = signedIn
): FixturePlayer {
	const [city, region] = profile.place ?? ['', ''];
	return {
		key,
		code: buildCode('player', random),
		displayName,
		accountEmail: key === 'tamsin' ? VERIFIED_EMAIL : `${key}@example.com`,
		legalName: profile.legalName ?? displayName,
		birthYear: profile.born[0],
		birthMonth: profile.born[1],
		genderDivision: profile.division,
		city,
		region,
		privacy
	};
}

// Invented place names, made up for the mocks.
export const PLAYERS: readonly FixturePlayer[] = [
	player('tamsin', '4RWN8TQ', 'Tamsin Vale', {
		born: [1988, 4],
		division: 'womens',
		place: ['Zorvale', 'Quenmarch']
	}),
	player('oren', '9HJD3XK', 'Oren Quill', {
		born: [1979, 11],
		division: 'mens',
		place: ['Zorvale', 'Quenmarch']
	}),
	player('bea', 'M2CF7YP', 'Bea Marlowe', { born: [1995, 2], division: 'womens', legalName: '' }),
	player('kit', 'T6BZ0NQ', 'Kit Ashdown', {
		born: [2001, 7],
		division: 'mens',
		place: ['Plinthaven', 'Ostrevain']
	}),
	player('rosa', '5XEGK8M', 'Rosa Fenwick', { born: [1964, 9], division: 'womens' }),
	player('idris', 'A7VH2DS', 'Idris Coldwell', {
		born: [1990, 1],
		division: 'mens',
		place: ['Plinthaven', 'Ostrevain']
	}),
	// Keeps the match history to themselves: other players get a 404 for it.
	player(
		'nell',
		'G3QY6JZ',
		'Nell Brightwater',
		{ born: [1983, 5], division: 'womens', place: ['Brindlequay', ''] },
		{ ...signedIn, match_history_visibility: 'private' }
	),
	// The one private player: an inactive account, so everyone else sees "Private player".
	player('saul', 'W8KN4FT', 'Saul Pemberly', { born: [1972, 12], division: 'mens' })
];

export const ACCOUNTS: readonly FixtureAccount[] = [
	...PLAYERS.map((p) => ({
		email: p.accountEmail as string,
		password: MOCK_PASSWORD,
		verified: true,
		active: p.key !== 'saul'
	})),
	{ email: UNVERIFIED_EMAIL, password: MOCK_PASSWORD, verified: false, active: true }
];

export type FixtureDecision = { player: PlayerKey; decision: 'confirm' | 'dispute' | 'withdraw' };

export type FixtureMatch = {
	/** The 11 random characters of the code. */
	random: string;
	status: 'pending' | 'confirmed' | 'disputed' | 'voided';
	format: 'singles' | 'doubles';
	playedOn: string;
	gameTarget: 11 | 15 | 21;
	scoringType: 'side_out' | 'rally';
	teamA: readonly PlayerKey[];
	teamB: readonly PlayerKey[];
	games: readonly (readonly [number, number])[];
	submittedBy: PlayerKey;
	decisions: readonly FixtureDecision[];
	/** For a disputed match: its status before the dispute, which a withdraw goes back to. */
	disputedFrom?: 'pending' | 'confirmed';
};

const dec = (
	player: PlayerKey,
	decision: FixtureDecision['decision'] = 'confirm'
): FixtureDecision => ({
	player,
	decision
});

/** Codes for the filler matches: valid and stable, from a counter. */
function fillerRandom(n: number): string {
	let rest = n;
	let tail = '';
	for (let i = 0; i < 8; i++) {
		tail = ALPHABET[rest % ALPHABET.length] + tail;
		rest = Math.floor(rest / ALPHABET.length);
	}
	return `ZZZ${tail}`;
}

type Short = {
	on: string;
	games: readonly (readonly [number, number])[];
	status?: FixtureMatch['status'];
	target?: 11 | 15 | 21;
	scoring?: 'side_out' | 'rally';
	/** Singles opponent, or the doubles pair when `partner` is set. */
	opp: readonly PlayerKey[];
	partner?: PlayerKey;
};

/** Older matches that fill the history, so it takes more than one page. Newest first. */
const OLDER: readonly Short[] = [
	{
		on: '2026-10-22',
		opp: ['oren'],
		games: [
			[11, 6],
			[9, 11],
			[11, 8]
		]
	},
	{
		on: '2026-10-20',
		opp: ['bea', 'kit'],
		partner: 'rosa',
		games: [
			[11, 9],
			[11, 7]
		]
	},
	{
		on: '2026-10-18',
		opp: ['idris'],
		games: [
			[7, 11],
			[8, 11]
		]
	},
	{
		on: '2026-10-15',
		opp: ['rosa', 'idris'],
		partner: 'oren',
		games: [
			[11, 4],
			[11, 6]
		]
	},
	{ on: '2026-10-13', opp: ['kit'], games: [[15, 13]], target: 15, scoring: 'rally' },
	{
		on: '2026-10-11',
		opp: ['bea'],
		games: [
			[11, 8],
			[6, 11],
			[11, 9]
		]
	},
	{
		on: '2026-10-09',
		opp: ['oren', 'nell'],
		partner: 'bea',
		games: [
			[9, 11],
			[11, 5],
			[8, 11]
		]
	},
	{ on: '2026-10-07', opp: ['rosa'], games: [[11, 2]] },
	{
		on: '2026-10-05',
		opp: ['idris', 'kit'],
		partner: 'nell',
		games: [
			[12, 10],
			[11, 8]
		]
	},
	{
		on: '2026-10-03',
		opp: ['oren'],
		games: [
			[11, 9],
			[9, 11],
			[7, 11]
		],
		status: 'disputed'
	},
	{
		on: '2026-10-01',
		opp: ['bea', 'rosa'],
		partner: 'kit',
		games: [[21, 17]],
		target: 21,
		scoring: 'rally'
	},
	{
		on: '2026-09-28',
		opp: ['idris'],
		games: [
			[11, 9],
			[11, 7]
		]
	},
	{
		on: '2026-09-26',
		opp: ['nell'],
		games: [
			[8, 11],
			[11, 6],
			[11, 4]
		]
	},
	{
		on: '2026-09-23',
		opp: ['kit', 'oren'],
		partner: 'rosa',
		games: [
			[11, 6],
			[11, 8]
		],
		status: 'voided'
	},
	{
		on: '2026-09-20',
		opp: ['bea'],
		games: [
			[11, 5],
			[11, 9]
		]
	},
	{
		on: '2026-09-17',
		opp: ['rosa', 'idris'],
		partner: 'oren',
		games: [
			[11, 13],
			[11, 9],
			[11, 7]
		]
	}
];

function fromShort(short: Short, index: number): FixtureMatch {
	const doubles = short.partner !== undefined;
	const status = short.status ?? 'confirmed';
	const teamA: PlayerKey[] = doubles ? ['tamsin', short.partner as PlayerKey] : ['tamsin'];
	const teamB = [...short.opp];
	const decisions: FixtureDecision[] =
		status === 'confirmed'
			? [dec('tamsin'), dec(teamB[0])]
			: status === 'disputed'
				? // Tamsin's own open dispute, so she can withdraw it. It was pending before.
					[dec('tamsin', 'dispute')]
				: [];
	return {
		random: fillerRandom(index + 1),
		status,
		format: doubles ? 'doubles' : 'singles',
		playedOn: short.on,
		gameTarget: short.target ?? 11,
		scoringType: short.scoring ?? 'side_out',
		teamA,
		teamB,
		games: short.games,
		submittedBy: 'tamsin',
		decisions
	};
}

/**
 * Tamsin's matches, newest first: three waiting on someone, then a mix of the other
 * statuses, then the older ones. Plus three matches between other players.
 */
export const MATCHES: readonly FixtureMatch[] = [
	{
		// Waiting on you: the other side recorded it and confirmed.
		random: '7QK2H9WD3NF',
		status: 'pending',
		format: 'doubles',
		playedOn: '2026-11-14',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin', 'oren'],
		teamB: ['bea', 'kit'],
		games: [
			[11, 7],
			[9, 11],
			[11, 4]
		],
		submittedBy: 'bea',
		decisions: [dec('bea')]
	},
	{
		// Waiting on you, singles.
		random: '3FTB8ZRMK6P',
		status: 'pending',
		format: 'singles',
		playedOn: '2026-11-12',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin'],
		teamB: ['rosa'],
		games: [
			[8, 11],
			[11, 6],
			[12, 10]
		],
		submittedBy: 'rosa',
		decisions: [dec('rosa')]
	},
	{
		// Waiting on the other side: you already confirmed.
		random: 'X4NC2GHJ9VQ',
		status: 'pending',
		format: 'doubles',
		playedOn: '2026-11-10',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin', 'nell'],
		teamB: ['saul', 'idris'],
		games: [
			[11, 13],
			[7, 11]
		],
		submittedBy: 'tamsin',
		decisions: [dec('tamsin')]
	},
	{
		random: 'D9PW5KXE7RM',
		status: 'confirmed',
		format: 'doubles',
		playedOn: '2026-11-08',
		gameTarget: 15,
		scoringType: 'rally',
		teamA: ['tamsin', 'nell'],
		teamB: ['idris', 'saul'],
		games: [[13, 15]],
		submittedBy: 'tamsin',
		decisions: [dec('tamsin'), dec('idris')]
	},
	{
		random: 'H2ZA6TQN4CJ',
		status: 'confirmed',
		format: 'doubles',
		playedOn: '2026-11-07',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin', 'oren'],
		teamB: ['rosa', 'idris'],
		games: [
			[11, 5],
			[11, 8]
		],
		submittedBy: 'oren',
		decisions: [dec('oren'), dec('rosa')]
	},
	{
		// Disputed, with the private player on the other side. Tamsin disputed and then withdrew,
		// so her decision is withdraw while Bea's dispute keeps the match disputed.
		random: 'R5GK9WBD2XF',
		status: 'disputed',
		format: 'doubles',
		playedOn: '2026-11-03',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin', 'kit'],
		teamB: ['bea', 'saul'],
		games: [
			[11, 9],
			[6, 11],
			[11, 13]
		],
		submittedBy: 'kit',
		decisions: [
			dec('kit'),
			dec('tamsin', 'dispute'),
			dec('tamsin', 'withdraw'),
			dec('bea', 'dispute')
		]
	},
	{
		random: '6YEM3HNV8QT',
		status: 'confirmed',
		format: 'singles',
		playedOn: '2026-11-01',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin'],
		teamB: ['saul'],
		games: [[11, 3]],
		submittedBy: 'tamsin',
		decisions: [dec('tamsin'), dec('saul')]
	},
	{
		random: 'B8TS4PCX1JW',
		status: 'voided',
		format: 'doubles',
		playedOn: '2026-10-30',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['tamsin', 'bea'],
		teamB: ['kit', 'oren'],
		games: [
			[11, 6],
			[11, 9]
		],
		submittedBy: 'tamsin',
		decisions: []
	},
	{
		random: 'N3QH7DFR5KZ',
		status: 'confirmed',
		format: 'doubles',
		playedOn: '2026-10-27',
		gameTarget: 21,
		scoringType: 'rally',
		teamA: ['tamsin', 'bea'],
		teamB: ['oren', 'nell'],
		games: [[21, 19]],
		submittedBy: 'bea',
		decisions: [dec('bea'), dec('oren')]
	},
	{
		random: 'F7JC2VWA9HM',
		status: 'confirmed',
		format: 'doubles',
		playedOn: '2026-10-25',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['rosa', 'tamsin'],
		teamB: ['idris', 'kit'],
		games: [
			[4, 11],
			[11, 7],
			[11, 9]
		],
		submittedBy: 'rosa',
		decisions: [dec('rosa'), dec('idris')]
	},
	...OLDER.map(fromShort),
	// Between other players. Tamsin is not in them, so she cannot confirm or dispute.
	{
		random: 'C4VD8RME2TX',
		status: 'confirmed',
		format: 'singles',
		playedOn: '2026-11-09',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['oren'],
		teamB: ['bea'],
		games: [
			[11, 8],
			[11, 5]
		],
		submittedBy: 'oren',
		decisions: [dec('oren'), dec('bea')]
	},
	{
		random: 'K9SA3WGP7DB',
		status: 'confirmed',
		format: 'singles',
		playedOn: '2026-11-05',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['rosa'],
		teamB: ['idris'],
		games: [
			[7, 11],
			[11, 9],
			[11, 6]
		],
		submittedBy: 'rosa',
		decisions: [dec('rosa'), dec('idris')]
	},
	{
		random: 'Q2HN6YCJ4VR',
		status: 'pending',
		format: 'singles',
		playedOn: '2026-11-13',
		gameTarget: 11,
		scoringType: 'side_out',
		teamA: ['kit'],
		teamB: ['oren'],
		games: [
			[11, 4],
			[11, 7]
		],
		submittedBy: 'kit',
		decisions: [dec('kit')]
	}
];

/** Demonstration ratings: made-up numbers, always labelled as a demonstration. */
export const RATINGS: Partial<Record<PlayerKey, PlayerRatingsOut>> = {
	tamsin: {
		ratings: {
			singles: {
				rating: 3.31,
				reliability: 0.4,
				provisional: true,
				updated_at: '2026-11-16T09:00:00Z'
			},
			doubles: {
				rating: 3.42,
				reliability: 0.65,
				provisional: true,
				updated_at: '2026-11-17T09:00:00Z'
			}
		},
		demonstration: true
	},
	oren: {
		ratings: {
			doubles: {
				rating: 3.84,
				reliability: 0.91,
				provisional: false,
				updated_at: '2026-11-17T09:00:00Z'
			}
		},
		demonstration: true
	},
	bea: {
		ratings: {
			singles: {
				rating: 3.05,
				reliability: 0.72,
				provisional: false,
				updated_at: '2026-11-15T09:00:00Z'
			}
		},
		demonstration: true
	}
};
