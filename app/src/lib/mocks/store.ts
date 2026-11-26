/**
 * The mock backend's state and rules, with no MSW in it.
 *
 * One store stands for one browser session: one signed-in account, one pending
 * sign-up, the matches recorded so far. Handlers (`handlers/`) turn requests into
 * calls on it and its results into responses. The rules follow the backend source:
 *
 * - `apps/matches/api.py`, `services.py` and `workflow.py` for matches,
 * - `apps/players/api.py` for the match list and its privacy rules,
 * - django-allauth headless with this backend's settings (email and password,
 *   mandatory verification by link) for accounts. Sign-up also takes the birth month and
 *   year, the gender division, the names, an optional city and region, and the agreements.
 *   The store holds those details for the new account (`signupHold`), as the backend's
 *   session does, until `POST me/player` uses them, and keeps the refusal flag
 *   (`signupRefused`), which `POST me/player` sets too.
 * - `apps/players/api.py` and `schemas.py` for `me/player` and the public profile. The
 *   create reads the hold when there is one, and its body otherwise.
 *
 * State is plain data (no Maps, no classes), so `snapshot` and `restore` can keep it in
 * `sessionStorage` across a page reload in the browser.
 */
import type { components } from '../api/generated/open';
import { ALPHABET, buildCode, normalizeCode, parsePlayerCode } from '../domain/codes';
import { canonicalEmailSchema, emailError, normalizeEmail } from '../domain/schemas';
import { validateMatch, type Issue } from '../domain/scores';
import { PRIVATE_PLAYER_NAME } from '../domain/mappers';
import {
	ACCOUNTS,
	MATCHES,
	MOCK_KEYS,
	PLAYERS,
	RATINGS,
	RATING_HISTORY,
	UNVERIFIED_EMAIL,
	VERIFIED_EMAIL,
	type PlayerKey,
	type RatingsByFormat
} from './fixtures';
import {
	AGE_REFUSAL,
	isFutureMonth,
	isMinor,
	isOldEnough,
	minorDisplayName,
	missingIssues,
	privacyNullIssues,
	profileIssues,
	ratingVisibilityIssues,
	type PlayerCreateIn,
	type PlayerUpdateIn,
	type ProfileValues
} from './player-rules';

type Schemas = components['schemas'];
type MatchOut = Schemas['MatchOut'];
type MatchCreateIn = Schemas['MatchCreateIn'];
type MyPlayerOut = Schemas['MyPlayerOut'];
type PlayerProfileOut = Schemas['PlayerProfileOut'];
type PrivacyOut = Schemas['PrivacyOut'];
type PlayerRatingsOut = Schemas['PlayerRatingsOut'];
type PagedRatingHistoryItemOut = Schemas['PagedRatingHistoryItemOut'];

/** The backend's default `OPEN_PUBLIC_PROFILE_URL`: `profile_url` is this and the code. */
const PUBLIC_PROFILE_URL = 'https://openpb.org/players/';

export type MockAccount = { email: string; password: string; verified: boolean; active: boolean };

export type MockPlayer = {
	code: string;
	displayName: string;
	accountEmail: string | null;
	/** Empty optional text is `""`, as the backend stores it. */
	legalName: string;
	birthYear: number;
	birthMonth: number;
	genderDivision: string;
	city: string;
	region: string;
	privacy: PrivacyOut;
};

export type MockDecision = { player: string; decision: 'confirm' | 'dispute' | 'withdraw' };

export type MockMatch = {
	code: string;
	status: MatchOut['status'];
	format: MatchOut['format'];
	playedOn: string;
	bestOf: MatchOut['best_of'];
	scoringType: MatchOut['scoring_type'];
	gameTarget: MatchOut['game_target'];
	teamA: string[];
	teamB: string[];
	games: { a: number; b: number }[];
	submittedBy: string | null;
	/** Creation order, the tie-break after the date when the list is sorted. */
	seq: number;
	/** When the match was submitted, as an ISO time. */
	createdAt: string;
	decisions: MockDecision[];
	/**
	 * The status a disputed match had when its dispute began, which a withdraw of the last open
	 * dispute goes back to (the backend reads it from the `match.dispute` Audit Event). Pending
	 * when not set.
	 */
	disputedFrom?: 'pending' | 'confirmed';
	/** Set while a possible duplicate hold keeps the match from counting. */
	hold?: MockHold;
};

/**
 * A possible duplicate hold on a match with no Event (ADR 0034). The backend links two matches;
 * the mock keeps only this one, since no screen may name the other. `vouched` lists the teams of
 * this match with a player who vouched, and `otherVouched` says whether the other match was
 * vouched for. The hold ends once both teams and the other match have vouched.
 */
export type MockHold = { vouched: ('A' | 'B')[]; otherVouched: boolean };

export type MockToken = { key: string; kind: 'verify_email' | 'reset_password'; email: string };

/** A message the backend would have emailed. Read it with `store.state.outbox`. */
export type MockMail = {
	kind: 'verify_email' | 'reset_password' | 'account_exists';
	to: string;
	/** The key in the link, when the mail has one. */
	key: string | null;
};

/**
 * The sign-up details the backend holds in the session for `create_my_player`. `email` is the
 * account they belong to, or null when the address was already taken (bound to no account).
 * Text is stored cleaned, as the sign-up form cleans it.
 */
export type SignupHold = {
	email: string | null;
	birthYear: number;
	birthMonth: number;
	genderDivision: string;
	firstName: string;
	lastName: string;
	city: string;
	region: string;
};

export type SignupDetails = Omit<SignupHold, 'email'>;

export type MockState = {
	accounts: MockAccount[];
	players: MockPlayer[];
	matches: MockMatch[];
	/** Current ratings by player code. A player left out has none yet. */
	ratings: Record<string, RatingsByFormat>;
	/** The signed-in account's email, and when it signed in (seconds since the epoch). */
	session: { email: string; at: number } | null;
	/** A sign-up or login waiting on email verification, in this browser session. */
	pendingEmail: string | null;
	/** The backend's session flag after an under-13 sign-up: later sign-ups are refused too. */
	signupRefused?: boolean;
	/** Sign-up details held for the create. Older snapshots have no such field. */
	signupHold?: SignupHold | null;
	tokens: MockToken[];
	outbox: MockMail[];
	csrfToken: string;
	counter: number;
};

const CSRF_TOKEN = 'mock-csrf-token-0123456789abcdefghijklmnopqrstuvwxyz-ABCDEFGHIJKL';

/** Passwords everyone knows are bad. A short stand-in for Django's list of common passwords. */
const COMMON_PASSWORDS = new Set([
	'password',
	'password1',
	'12345678',
	'123456789',
	'qwertyuiop',
	'iloveyou1',
	'letmein123'
]);

export type FieldIssue = {
	field: string;
	code: string;
	message: string;
	/** Only on a duplicate match item: the earlier match's code. */
	existing_code?: string;
};

export type PasswordError = { code: string; message: string };

/** Django's password validators, as configured by the backend (`AUTH_PASSWORD_VALIDATORS`). */
export function passwordErrors(password: string, email: string): PasswordError[] {
	const errors: PasswordError[] = [];
	const local = email.split('@')[0]?.toLowerCase() ?? '';
	if (local.length >= 3 && password.toLowerCase().includes(local)) {
		errors.push({
			code: 'password_too_similar',
			message: 'The password is too similar to the email address.'
		});
	}
	if (password.length < 8) {
		errors.push({
			code: 'password_too_short',
			message: 'This password is too short. It must contain at least 8 characters.'
		});
	}
	if (COMMON_PASSWORDS.has(password.toLowerCase())) {
		errors.push({ code: 'password_too_common', message: 'This password is too common.' });
	}
	if (/^\d+$/.test(password)) {
		errors.push({
			code: 'password_entirely_numeric',
			message: 'This password is entirely numeric.'
		});
	}
	return errors;
}

function seed(): MockState {
	const byKey = new Map(PLAYERS.map((p) => [p.key, p.code]));
	const code = (key: PlayerKey): string => byKey.get(key) as string;
	const ratings: Record<string, RatingsByFormat> = {};
	for (const [key, value] of Object.entries(RATINGS)) {
		ratings[code(key as PlayerKey)] = structuredClone(value);
	}
	// Fixtures list newest first. `seq` counts up, so the oldest gets the lowest.
	const total = MATCHES.length;
	return {
		accounts: ACCOUNTS.map((a) => ({ ...a })),
		players: PLAYERS.map((p) => ({
			code: p.code,
			displayName: p.displayName,
			accountEmail: p.accountEmail,
			legalName: p.legalName,
			birthYear: p.birthYear,
			birthMonth: p.birthMonth,
			genderDivision: p.genderDivision,
			city: p.city,
			region: p.region,
			privacy: { ...p.privacy }
		})),
		matches: MATCHES.map((m, index) => ({
			code: buildCode('match', m.random),
			status: m.status,
			format: m.format,
			playedOn: m.playedOn,
			bestOf: m.games.length === 1 ? 1 : 3,
			scoringType: m.scoringType,
			gameTarget: m.gameTarget,
			teamA: m.teamA.map(code),
			teamB: m.teamB.map(code),
			games: m.games.map(([a, b]) => ({ a, b })),
			submittedBy: PLAYERS.find((p) => p.key === m.submittedBy)?.accountEmail ?? null,
			seq: total - index,
			createdAt: `${m.playedOn}T18:00:00Z`,
			decisions: m.decisions.map((d) => ({ player: code(d.player), decision: d.decision })),
			...(m.disputedFrom ? { disputedFrom: m.disputedFrom } : {}),
			...(m.hold
				? { hold: { vouched: [...m.hold.vouched], otherVouched: m.hold.otherVouched } }
				: {})
		})),
		ratings,
		session: null,
		pendingEmail: null,
		tokens: [
			{ key: MOCK_KEYS.verifyEmail, kind: 'verify_email', email: UNVERIFIED_EMAIL },
			{ key: MOCK_KEYS.resetPassword, kind: 'reset_password', email: VERIFIED_EMAIL }
		],
		outbox: [],
		csrfToken: CSRF_TOKEN,
		counter: 0
	};
}

function counterCode(counter: number, width: number, lead: string): string {
	let rest = counter;
	let tail = '';
	for (let i = 0; i < width - lead.length; i++) {
		tail = ALPHABET[rest % ALPHABET.length] + tail;
		rest = Math.floor(rest / ALPHABET.length);
	}
	return lead + tail;
}

export type SubmitResult =
	| { ok: true; match: MockMatch }
	| { ok: false; kind: 'forbidden' }
	| { ok: false; kind: 'validation'; issues: FieldIssue[] }
	| { ok: false; kind: 'duplicate'; existing: string };

export type ChangeResult =
	{ ok: true; match: MockMatch } | { ok: false; kind: 'not_found' | 'conflict' };

export type ListResult =
	{ ok: true; items: MockMatch[]; count: number } | { ok: false; kind: 'not_found' };

export type LoginResult = 'ok' | 'mismatch' | 'unverified';

export type CreatePlayerResult =
	| { ok: true; player: MockPlayer }
	| { ok: false; kind: 'unverified' }
	| { ok: false; kind: 'conflict' }
	| { ok: false; kind: 'validation'; issues: FieldIssue[] };

/** `create_player`: every setting signed_in for an adult, private for a player aged 13 to 17. */
function startingPrivacy(visibility: PrivacyOut['stats_visibility']): PrivacyOut {
	return {
		city_region_visibility: visibility,
		match_history_visibility: visibility,
		rating_history_visibility: visibility,
		stats_visibility: visibility,
		home_club_visibility: visibility,
		rating_visibility: visibility
	};
}

/** A saved player in this version's shape. */
function isMockPlayer(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const player = value as Record<string, unknown>;
	return (
		typeof player.code === 'string' &&
		typeof player.displayName === 'string' &&
		typeof player.legalName === 'string' &&
		typeof player.birthYear === 'number' &&
		typeof player.birthMonth === 'number' &&
		typeof player.genderDivision === 'string' &&
		typeof player.city === 'string' &&
		typeof player.region === 'string' &&
		typeof player.privacy === 'object' &&
		player.privacy !== null &&
		'rating_visibility' in player.privacy &&
		!('homeClub' in player)
	);
}

/** A saved hold in this version's shape. */
function isSignupHold(value: unknown): boolean {
	if (typeof value !== 'object' || value === null) return false;
	const hold = value as Record<string, unknown>;
	const texts = ['genderDivision', 'firstName', 'lastName', 'city', 'region'];
	return (
		(hold.email === null || typeof hold.email === 'string') &&
		typeof hold.birthYear === 'number' &&
		typeof hold.birthMonth === 'number' &&
		texts.every((key) => typeof hold[key] === 'string')
	);
}

/**
 * The backend's `starting_display_name`: "First Last" for an adult, and "First L." for a player
 * aged 13 to 17 (see `minorDisplayName`).
 */
function startingDisplayName(hold: SignupHold): string {
	return isMinor(hold.birthYear, hold.birthMonth)
		? minorDisplayName(hold.firstName, hold.lastName)
		: `${hold.firstName} ${hold.lastName}`;
}

export type MockStore = ReturnType<typeof createMockStore>;

export function createMockStore() {
	let state = seed();

	// Accounts and the session

	const accountByEmail = (email: string): MockAccount | undefined =>
		state.accounts.find((a) => a.email === email);

	const playerByCode = (code: string): MockPlayer | undefined =>
		state.players.find((p) => p.code === code);

	const playerOfAccount = (email: string): MockPlayer | undefined =>
		state.players.find((p) => p.accountEmail === email);

	function nextCounter(): number {
		state.counter += 1;
		return state.counter;
	}

	function sendMail(kind: MockMail['kind'], to: string): string | null {
		let key: string | null = null;
		if (kind !== 'account_exists') {
			key = `mock-${kind === 'verify_email' ? 'verify' : 'reset'}-${nextCounter()}`;
			state.tokens.push({ key, kind, email: to });
		}
		state.outbox.push({ kind, to, key });
		return key;
	}

	return {
		get state() {
			return state;
		},

		/** Back to the seed: no session, no recorded matches, no mail. */
		reset(): void {
			state = seed();
		},

		snapshot(): string {
			return JSON.stringify(state);
		},

		restore(serialized: string): boolean {
			try {
				const parsed = JSON.parse(serialized) as MockState;
				const lists = [
					parsed.accounts,
					parsed.players,
					parsed.matches,
					parsed.tokens,
					parsed.outbox
				];
				const fresh = seed();
				if (!lists.every(Array.isArray) || typeof parsed.csrfToken !== 'string') return false;
				if (typeof parsed.ratings !== 'object' || parsed.ratings === null) return false;
				// Ratings saved in the older mocked shape (a `ratings` object per player, with
				// reliability 0 to 1) would show nothing: drop the snapshot.
				if (Object.values(parsed.ratings).some((entry) => 'ratings' in entry)) return false;
				// Players saved before the profile fields (a home club, no city) would show
				// undefined on the profile page: drop the snapshot.
				if (!parsed.players.every(isMockPlayer)) return false;
				// A hold of another shape would create a player with undefined fields.
				const hold = parsed.signupHold;
				if (hold !== undefined && hold !== null && !isSignupHold(hold)) return false;
				// A snapshot from older fixtures would show stale data: drop it.
				if (parsed.matches.length < fresh.matches.length) return false;
				state = parsed;
				return true;
			} catch {
				return false;
			}
		},

		accountByEmail,
		playerByCode,
		playerOfAccount,

		/** The signed-in account, or undefined. An inactive account is never signed in. */
		currentAccount(): MockAccount | undefined {
			const email = state.session?.email;
			const account = email ? accountByEmail(email) : undefined;
			return account?.active ? account : undefined;
		},

		/** The code of the player that belongs to the signed-in account. */
		currentPlayer(): MockPlayer | undefined {
			const account = this.currentAccount();
			return account ? playerOfAccount(account.email) : undefined;
		},

		/** allauth's login: the address must be canonical, the password must match, and the address verified. */
		login(email: string, password: string): LoginResult {
			const canonical = canonicalEmailSchema.safeParse(email);
			const account = canonical.success ? accountByEmail(canonical.data) : undefined;
			if (!account || !account.active || account.password !== password) return 'mismatch';
			if (!account.verified) {
				state.pendingEmail = account.email;
				sendMail('verify_email', account.email);
				return 'unverified';
			}
			state.session = { email: account.email, at: Date.now() / 1000 };
			state.pendingEmail = null;
			return 'ok';
		},

		/** Logging out flushes the session: the hold goes, the refusal flag stays (ADR 0017). */
		logout(): void {
			state.session = null;
			state.pendingEmail = null;
			state.signupHold = null;
		},

		/** Hold sign-up details for `email`, or bound to no account when `email` is null. */
		holdSignup(email: string | null, details: SignupDetails): void {
			state.signupHold = { email, ...details };
		},

		/** The backend's age refusal: the session is refused from now on, and the hold goes. */
		refuseSignup(): void {
			state.signupRefused = true;
			state.signupHold = null;
		},

		/**
		 * allauth's sign-up with `ACCOUNT_PREVENT_ENUMERATION`: a taken address gets the same
		 * answer as a new one, and its owner is mailed that an account exists. The details are
		 * held for the new account. A taken address holds them bound to no account, unless the
		 * session already holds details for that address (a repeated sign-up): those are kept,
		 * as the backend's `_is_held_for_login` does.
		 */
		signup(email: string, password: string, details?: SignupDetails): void {
			const normalized = normalizeEmail(email);
			if (accountByEmail(normalized)) {
				sendMail('account_exists', normalized);
				if (details && state.signupHold?.email !== normalized) this.holdSignup(null, details);
			} else {
				state.accounts.push({ email: normalized, password, verified: false, active: true });
				sendMail('verify_email', normalized);
				if (details) this.holdSignup(normalized, details);
			}
			state.pendingEmail = normalized;
		},

		/** Field errors for an email as the sign-up form checks it, or an empty list. */
		emailIssues(email: string): { code: string; message: string }[] {
			const message = emailError(normalizeEmail(email));
			if (!message) return [];
			const code = message.includes('ASCII')
				? 'email_not_ascii'
				: message.includes('at most')
					? 'email_too_long'
					: 'invalid';
			return [{ code, message }];
		},

		tokenFor(key: string, kind: MockToken['kind']): MockToken | undefined {
			return state.tokens.find((t) => t.key === key && t.kind === kind);
		},

		/** Verify the address a key was sent for. The session stays signed out: the backend does not log in on verification. */
		verifyEmail(key: string): { email: string; wasPending: boolean } | undefined {
			const token = this.tokenFor(key, 'verify_email');
			const account = token ? accountByEmail(token.email) : undefined;
			if (!token || !account) return undefined;
			account.verified = true;
			const wasPending = state.pendingEmail === token.email;
			state.pendingEmail = null;
			return { email: token.email, wasPending };
		},

		requestPasswordReset(email: string): void {
			const canonical = canonicalEmailSchema.safeParse(email);
			if (!canonical.success) return;
			const account = accountByEmail(canonical.data);
			if (account?.active) sendMail('reset_password', account.email);
		},

		/** Set a new password with a reset key. The key works once. */
		resetPassword(key: string, password: string): boolean {
			const token = this.tokenFor(key, 'reset_password');
			const account = token ? accountByEmail(token.email) : undefined;
			if (!token || !account) return false;
			account.password = password;
			// Proving the mailbox is enough to count the address as verified.
			account.verified = true;
			state.tokens = state.tokens.filter((t) => t.key !== key);
			return true;
		},

		// Players: `me/player` and the public profile (backend#124)

		myPlayerOut(player: MockPlayer): MyPlayerOut {
			return {
				code: player.code,
				display_name: player.displayName,
				legal_name: player.legalName,
				birth_year: player.birthYear,
				birth_month: player.birthMonth,
				gender_division: player.genderDivision,
				city: player.city,
				region: player.region,
				privacy: { ...player.privacy }
			};
		},

		/**
		 * `create_my_player` after the body passed the schema: 403 for an unverified email, 409
		 * for a second player (which drops the hold), the session's age refusal, then the
		 * details held at sign-up for this account, or else the body with its missing details.
		 * Then the age, then the model's other checks. An under-13 or future age refuses the
		 * session, as sign-up does, whatever else is wrong. A 201 drops the hold; any other
		 * failure keeps it, so the create can be tried again.
		 */
		createMyPlayer(email: string, body: PlayerCreateIn): CreatePlayerResult {
			if (!accountByEmail(email)?.verified) return { ok: false, kind: 'unverified' };
			if (playerOfAccount(email)) {
				state.signupHold = null;
				return { ok: false, kind: 'conflict' };
			}
			if (state.signupRefused) return { ok: false, kind: 'validation', issues: [AGE_REFUSAL] };
			const held = state.signupHold?.email === email ? state.signupHold : null;
			let values: ProfileValues;
			if (held) {
				values = {
					display_name: startingDisplayName(held),
					legal_name: `${held.firstName} ${held.lastName}`,
					birth_year: held.birthYear,
					birth_month: held.birthMonth,
					gender_division: held.genderDivision,
					city: held.city,
					region: held.region
				};
			} else {
				const missing = missingIssues(body);
				if (missing.length > 0) return { ok: false, kind: 'validation', issues: missing };
				values = body as ProfileValues;
			}
			const year = values.birth_year as number;
			const month = values.birth_month as number;
			// Django's full_clean runs the age rule even when a field fails, and the view checks
			// the age refusal before it reports field errors. A month out of range has no age.
			const datable = month >= 1 && month <= 12;
			if (datable && (isFutureMonth(year, month) || !isOldEnough(year, month))) {
				this.refuseSignup();
				return { ok: false, kind: 'validation', issues: [AGE_REFUSAL] };
			}
			const { issues, clean } = profileIssues(values);
			if (issues.length > 0) return { ok: false, kind: 'validation', issues };
			state.signupHold = null;
			const player: MockPlayer = {
				code: buildCode('player', counterCode(nextCounter(), 7, 'NEW')),
				displayName: clean.display_name as string,
				accountEmail: email,
				legalName: clean.legal_name ?? '',
				birthYear: year,
				birthMonth: month,
				genderDivision: clean.gender_division as string,
				city: clean.city ?? '',
				region: clean.region ?? '',
				privacy: startingPrivacy(isMinor(year, month) ? 'private' : 'signed_in')
			};
			state.players.push(player);
			return { ok: true, player };
		},

		/**
		 * `update_my_player` after the body passed the schema: only the fields sent change, and
		 * a refused profile or privacy change changes nothing. Returns the model's issues.
		 */
		updateMyPlayer(player: MockPlayer, body: PlayerUpdateIn): FieldIssue[] {
			const { privacy, ...profile } = body;
			const { issues, clean } = profileIssues(profile);
			if (issues.length > 0) return issues;
			const ratingIssues = ratingVisibilityIssues(
				player.privacy.rating_visibility,
				isMinor(player.birthYear, player.birthMonth),
				privacy
			);
			if (ratingIssues.length > 0) return ratingIssues;
			const privacyIssues = privacyNullIssues(privacy);
			if (privacyIssues.length > 0) return privacyIssues;
			if (clean.display_name != null) player.displayName = clean.display_name;
			if (clean.legal_name != null) player.legalName = clean.legal_name;
			if (clean.city != null) player.city = clean.city;
			if (clean.region != null) player.region = clean.region;
			if (privacy) Object.assign(player.privacy, privacy);
			return [];
		},

		/**
		 * `get_player`: a player as the signed-in viewer sees them, or undefined when hidden
		 * (inactive account). Like `PlayerPrivacy.visible_to`, the city and region go to the
		 * owner, or to another active viewer when the setting is `signed_in`. Empty ones are
		 * null, so the answer never tells hidden from empty.
		 */
		publicProfile(code: string, viewerEmail: string): PlayerProfileOut | undefined {
			const player = playerByCode(code);
			if (!player || !this.isListed(player)) return undefined;
			const viewer = accountByEmail(viewerEmail);
			const shown =
				viewer?.active === true &&
				(viewer.email === player.accountEmail ||
					player.privacy.city_region_visibility === 'signed_in');
			return {
				code: player.code,
				display_name: player.displayName,
				city: shown ? player.city || null : null,
				region: shown ? player.region || null : null
			};
		},

		/** Whether the public may see this player at all: the account must be active. */
		isListed(player: MockPlayer): boolean {
			const account = player.accountEmail ? accountByEmail(player.accountEmail) : undefined;
			return account?.active ?? false;
		},

		/**
		 * `get_player_ratings`: a player's current ratings as the viewer sees them, or undefined
		 * (a 404) for an unknown or inactive player, and for another viewer when the player's
		 * `rating_visibility` is private. The player always sees their own.
		 */
		ratingsFor(code: string, viewerEmail: string): PlayerRatingsOut | undefined {
			const player = playerByCode(code);
			if (!player || !this.isListed(player)) return undefined;
			const own = player.accountEmail === viewerEmail;
			if (!own && player.privacy.rating_visibility !== 'signed_in') return undefined;
			return {
				code: player.code,
				profile_url: `${PUBLIC_PROFILE_URL}${player.code}`,
				demonstration: true,
				ratings: structuredClone(state.ratings[code] ?? {})
			};
		},

		/**
		 * `list_player_rating_history`: one page of a player's rating history, newest first, or
		 * undefined (a 404) for an unknown code, and for another viewer when the player's account
		 * is inactive or `rating_history_visibility` is private. The player always sees their own.
		 * The history is fixed fixture data: recording a match here adds no change.
		 */
		ratingHistoryFor(
			code: string,
			viewerEmail: string,
			limit: number,
			offset: number
		): PagedRatingHistoryItemOut | undefined {
			const player = playerByCode(code);
			if (!player) return undefined;
			const own = player.accountEmail === viewerEmail;
			if (
				!own &&
				(!this.isListed(player) || player.privacy.rating_history_visibility !== 'signed_in')
			) {
				return undefined;
			}
			const key = PLAYERS.find((p) => p.code === code)?.key;
			const all = (key && RATING_HISTORY[key]) || [];
			return { items: structuredClone(all.slice(offset, offset + limit)), count: all.length };
		},

		// Matches

		/** A match as the viewer sees it. A player with an inactive account is private to everyone else. */
		matchOut(match: MockMatch, viewerEmail: string | null): MatchOut {
			const participant = (code: string) => {
				const player = playerByCode(code);
				if (!player) return { code: null, display_name: PRIVATE_PLAYER_NAME };
				const account = player.accountEmail ? accountByEmail(player.accountEmail) : undefined;
				const isViewer = viewerEmail !== null && player.accountEmail === viewerEmail;
				if (!account?.active && !isViewer) return { code: null, display_name: PRIVATE_PLAYER_NAME };
				return { code: player.code, display_name: player.displayName };
			};
			const own = viewerEmail ? playerOfAccount(viewerEmail) : undefined;
			const onA = own !== undefined && match.teamA.includes(own.code);
			const onB = own !== undefined && match.teamB.includes(own.code);
			const confirmedBy = (team: string[]) =>
				match.decisions.some((d) => d.decision === 'confirm' && team.includes(d.player));
			// The latest decision this player recorded, as the backend reports it.
			const latest =
				onA || onB ? match.decisions.findLast((d) => d.player === own?.code) : undefined;
			return {
				code: match.code,
				my_team: onA ? 'A' : onB ? 'B' : null,
				my_decision: latest?.decision ?? 'none',
				confirmed_by_team:
					onA || onB ? { a: confirmedBy(match.teamA), b: confirmedBy(match.teamB) } : null,
				created_at: match.createdAt,
				status: match.status,
				format: match.format,
				played_on: match.playedOn,
				best_of: match.bestOf,
				scoring_type: match.scoringType,
				game_target: match.gameTarget,
				team_a: match.teamA.map(participant),
				team_b: match.teamB.map(participant),
				games: match.games.map((g, i) => ({ number: i + 1, team_a: g.a, team_b: g.b }))
			};
		},

		matchByCode(code: string): MockMatch | undefined {
			return state.matches.find((m) => m.code === code);
		},

		/**
		 * `get_match`: a match in any status, for a player who played in it. Everyone else, with
		 * an unknown code or not, gets undefined (a 404 in the API). Organizers get no more than
		 * other accounts.
		 */
		matchForParticipant(email: string, code: string): MockMatch | undefined {
			const match = this.matchByCode(code);
			const own = playerOfAccount(email);
			if (!match || !own || ![...match.teamA, ...match.teamB].includes(own.code)) return undefined;
			return match;
		},

		/**
		 * `create_match` after the request body has passed schema validation. Follows
		 * `apps/matches/api.py`: the submitter must play in it (403), every code must belong to
		 * a player (422), the score rules (422), then the duplicate check (409). The new match
		 * stays pending with the submitter's confirmation, so it waits on the other team.
		 */
		submitMatch(email: string, body: MatchCreateIn): SubmitResult {
			const own = playerOfAccount(email);
			const normalize = (raw: string): string | null => {
				const result = normalizeCode(raw, 'player');
				return result.ok ? result.value : null;
			};
			const submitted = new Set(
				[...body.team_a, ...body.team_b].map(normalize).filter((c): c is string => c !== null)
			);
			if (!own || !submitted.has(own.code)) return { ok: false, kind: 'forbidden' };

			const unknown: FieldIssue[] = [];
			for (const [team, codes] of [
				['team_a', body.team_a],
				['team_b', body.team_b]
			] as const) {
				codes.forEach((raw, index) => {
					const code = normalize(raw);
					if (code === null || !playerByCode(code)) {
						unknown.push({
							field: `body.${team}.${index}`,
							code: 'unknown_player',
							message: 'No player has this OPEN Code.'
						});
					}
				});
			}
			if (unknown.length > 0) return { ok: false, kind: 'validation', issues: unknown };

			const checked = validateMatch({
				format: body.format,
				playedOn: body.played_on,
				teamA: body.team_a,
				teamB: body.team_b,
				games: body.games.map((g) => ({ teamA: g.team_a, teamB: g.team_b })),
				bestOf: body.best_of,
				gameTarget: body.game_target,
				scoringType: body.scoring_type
			});
			if (!checked.ok) return { ok: false, kind: 'validation', issues: checked.error.map(inBody) };
			const valid = checked.value;

			const duplicate = state.matches.find(
				(m) =>
					m.status !== 'voided' &&
					fingerprint(m.teamA, m.teamB, m.playedOn, m.games) ===
						fingerprint(
							[...valid.teamA],
							[...valid.teamB],
							valid.playedOn,
							valid.games.map((g) => ({ a: g.teamA, b: g.teamB }))
						)
			);
			if (duplicate) return { ok: false, kind: 'duplicate', existing: duplicate.code };

			const match: MockMatch = {
				code: buildCode('match', counterCode(nextCounter(), 11, 'NEW')),
				status: 'pending',
				format: valid.format,
				playedOn: valid.playedOn,
				bestOf: valid.bestOf,
				scoringType: valid.scoringType,
				gameTarget: valid.gameTarget,
				teamA: [...valid.teamA],
				teamB: [...valid.teamB],
				games: valid.games.map((g) => ({ a: g.teamA, b: g.teamB })),
				submittedBy: email,
				seq: Math.max(0, ...state.matches.map((m) => m.seq)) + 1,
				createdAt: new Date().toISOString(),
				// The submission is the submitter's own confirmation (backend #197).
				decisions: [{ player: own.code, decision: 'confirm' }]
			};
			state.matches.push(match);
			return { ok: true, match };
		},

		/**
		 * `workflow.confirm_match` and `workflow.dispute_match` for a participant. Anyone who
		 * did not play gets the unknown-code 404. A disputed or voided match cannot be
		 * confirmed, and a voided one cannot be disputed (409).
		 */
		changeMatch(email: string, code: string, action: 'confirm' | 'dispute'): ChangeResult {
			const match = this.matchByCode(code);
			const own = playerOfAccount(email);
			if (!match || !own || ![...match.teamA, ...match.teamB].includes(own.code)) {
				return { ok: false, kind: 'not_found' };
			}
			const has = (decision: MockDecision['decision']) =>
				match.decisions.some((d) => d.player === own.code && d.decision === decision);
			const record = (decision: MockDecision['decision']): boolean => {
				if (has(decision)) return false;
				match.decisions.push({ player: own.code, decision });
				return true;
			};

			if (action === 'confirm') {
				if (match.status !== 'pending' && match.status !== 'confirmed') {
					return { ok: false, kind: 'conflict' };
				}
				record('confirm');
				if (match.status === 'pending' && this.bothTeamsConfirmed(match)) {
					match.status = 'confirmed';
				}
				return { ok: true, match };
			}
			if (match.status === 'voided') return { ok: false, kind: 'conflict' };
			// A player disputes a match once: a repeat, also after they withdrew, changes nothing.
			const added = record('dispute');
			if (added && match.status !== 'disputed') {
				match.disputedFrom = match.status;
				match.status = 'disputed';
			}
			return { ok: true, match };
		},

		/**
		 * `workflow.withdraw_dispute` for a participant. Anyone who did not play gets the
		 * unknown-code 404. A voided match is a 409 first, even after a withdraw. A repeat withdraw
		 * changes nothing. A match that is not disputed, or has no open dispute of theirs, is a 409.
		 * The match stays disputed while another player's dispute is open, and goes back to how it
		 * was before the dispute once none is. The mock has no Event organizer, so a dispute is
		 * never settled by one, and every dispute not withdrawn is open.
		 */
		withdrawDispute(email: string, code: string): ChangeResult {
			const match = this.matchByCode(code);
			const own = playerOfAccount(email);
			if (!match || !own || ![...match.teamA, ...match.teamB].includes(own.code)) {
				return { ok: false, kind: 'not_found' };
			}
			if (match.status === 'voided') return { ok: false, kind: 'conflict' };
			const withdrew = (player: string) =>
				match.decisions.some((d) => d.player === player && d.decision === 'withdraw');
			if (withdrew(own.code)) return { ok: true, match };
			if (match.status !== 'disputed') return { ok: false, kind: 'conflict' };
			const open = new Set(
				match.decisions
					.filter((d) => d.decision === 'dispute' && !withdrew(d.player))
					.map((d) => d.player)
			);
			if (!open.has(own.code)) return { ok: false, kind: 'conflict' };
			match.decisions.push({ player: own.code, decision: 'withdraw' });
			if (open.size === 1) {
				match.status = match.disputedFrom ?? 'pending';
				delete match.disputedFrom;
			}
			return { ok: true, match };
		},

		bothTeamsConfirmed(match: MockMatch): boolean {
			const confirmed = new Set(
				match.decisions.filter((d) => d.decision === 'confirm').map((d) => d.player)
			);
			return match.teamA.some((c) => confirmed.has(c)) && match.teamB.some((c) => confirmed.has(c));
		},

		/**
		 * `list_player_matches`. The player sees every status. Anyone else signed in sees
		 * confirmed matches only, and a 404 when the history is private or the account inactive.
		 */
		listPlayerMatches(
			viewerEmail: string,
			code: string,
			limit: number,
			offset: number
		): ListResult {
			const player = playerByCode(code);
			if (!player) return { ok: false, kind: 'not_found' };
			const isOwn = player.accountEmail === viewerEmail;
			if (
				!isOwn &&
				(!this.isListed(player) || player.privacy.match_history_visibility !== 'signed_in')
			) {
				return { ok: false, kind: 'not_found' };
			}
			const all = state.matches
				.filter((m) => [...m.teamA, ...m.teamB].includes(code))
				.filter((m) => isOwn || m.status === 'confirmed')
				.sort(newestFirst);
			return { ok: true, items: all.slice(offset, offset + limit), count: all.length };
		},

		/**
		 * `list_matches_awaiting_confirmation`: pending matches the signed-in account's player
		 * played in where no one on their team has confirmed yet, newest first. An account with no
		 * player gets an empty page. A disputed or voided match is never pending, so never listed.
		 */
		listAwaitingConfirmation(
			viewerEmail: string,
			limit: number,
			offset: number
		): { items: MockMatch[]; count: number } {
			const own = playerOfAccount(viewerEmail);
			if (!own) return { items: [], count: 0 };
			const all = state.matches
				.filter((m) => {
					if (m.status !== 'pending') return false;
					const team = m.teamA.includes(own.code)
						? m.teamA
						: m.teamB.includes(own.code)
							? m.teamB
							: null;
					return (
						team !== null &&
						!m.decisions.some((d) => d.decision === 'confirm' && team.includes(d.player))
					);
				})
				.sort(newestFirst);
			return { items: all.slice(offset, offset + limit), count: all.length };
		},

		/**
		 * `list_my_disputes`: the disputed matches the signed-in account's player played in,
		 * whoever disputed them, newest first. An account with no player gets an empty page.
		 */
		listMyDisputes(
			viewerEmail: string,
			limit: number,
			offset: number
		): { items: MockMatch[]; count: number } {
			const own = playerOfAccount(viewerEmail);
			if (!own) return { items: [], count: 0 };
			const all = state.matches
				.filter((m) => m.status === 'disputed' && [...m.teamA, ...m.teamB].includes(own.code))
				.sort(newestFirst);
			return { items: all.slice(offset, offset + limit), count: all.length };
		},

		/**
		 * `list_my_holds` for a player: the held matches with no Event the signed-in account's
		 * player played in, newest first, that are not voided. `vouched` is true once a player on
		 * their team vouched. The mock has no Event organizer, so it lists no Event match.
		 */
		listMyHolds(
			viewerEmail: string,
			limit: number,
			offset: number
		): { items: { match: MockMatch; vouched: boolean }[]; count: number } {
			const own = playerOfAccount(viewerEmail);
			if (!own) return { items: [], count: 0 };
			const all = state.matches
				.filter(
					(m) => m.hold && m.status !== 'voided' && [...m.teamA, ...m.teamB].includes(own.code)
				)
				.sort(newestFirst)
				.map((match) => {
					const team = match.teamA.includes(own.code) ? 'A' : 'B';
					return { match, vouched: match.hold!.vouched.includes(team) };
				});
			return { items: all.slice(offset, offset + limit), count: all.length };
		},

		/**
		 * `workflow.vouch_for_match` for a player of a match with no Event. Anyone who did not play
		 * gets the unknown-code 404. A voided match, and a match no hold keeps, are a 409. A repeat
		 * changes nothing. The hold ends once a player of each team vouched and the other match was
		 * vouched for.
		 */
		vouch(email: string, code: string): ChangeResult {
			const match = this.matchByCode(code);
			const own = playerOfAccount(email);
			if (!match || !own || ![...match.teamA, ...match.teamB].includes(own.code)) {
				return { ok: false, kind: 'not_found' };
			}
			if (match.status === 'voided' || !match.hold) return { ok: false, kind: 'conflict' };
			const team = match.teamA.includes(own.code) ? 'A' : 'B';
			if (!match.hold.vouched.includes(team)) match.hold.vouched.push(team);
			if (match.hold.vouched.length === 2 && match.hold.otherVouched) delete match.hold;
			return { ok: true, match };
		},

		/** Whether a code is a well-formed player code (a malformed one is a 404 in the API). */
		parsePlayerCode
	};
}

/** The history order: newest played date first, then the latest submitted. */
function newestFirst(a: MockMatch, b: MockMatch): number {
	return a.playedOn === b.playedOn ? b.seq - a.seq : a.playedOn < b.playedOn ? 1 : -1;
}

/** The same fingerprint idea as `match_fingerprint`: player and team order do not matter. */
function fingerprint(
	teamA: readonly string[],
	teamB: readonly string[],
	playedOn: string,
	games: readonly { a: number; b: number }[]
): string {
	const first = [...teamA].sort().join(',');
	const second = [...teamB].sort().join(',');
	const swapped = first > second;
	const scores = games.map((g) => (swapped ? `${g.b}-${g.a}` : `${g.a}-${g.b}`)).join(' ');
	return [swapped ? second : first, swapped ? first : second, playedOn, scores].join('|');
}

/** `_in_body`: the issues for a request field are located in the body. */
const BODY_FIELDS = new Set([
	'format',
	'played_on',
	'team_a',
	'team_b',
	'games',
	'best_of',
	'scoring_type',
	'game_target'
]);

function inBody(issue: Issue): FieldIssue {
	const root = issue.field.split('.')[0];
	return BODY_FIELDS.has(root) ? { ...issue, field: `body.${issue.field}` } : issue;
}

/** The store the default handlers use. Tests call `resetMockStore()` between cases. */
export const mockStore = createMockStore();

export function resetMockStore(): void {
	mockStore.reset();
}
