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
 *   mandatory verification by link) for accounts.
 *
 * State is plain data (no Maps, no classes), so `snapshot` and `restore` can keep it in
 * `sessionStorage` across a page reload in the browser.
 */
import type { components } from '../api/generated/open';
import type {
	MyPlayerCreateIn,
	MyPlayerOut,
	MyPlayerUpdateIn,
	PlayerProfileOut,
	PlayerRatingsOut,
	PrivacySettings
} from '../api/provisional';
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
	UNVERIFIED_EMAIL,
	VERIFIED_EMAIL,
	type PlayerKey
} from './fixtures';

type Schemas = components['schemas'];
type MatchOut = Schemas['MatchOut'];
type MatchCreateIn = Schemas['MatchCreateIn'];

export type MockAccount = { email: string; password: string; verified: boolean; active: boolean };

export type MockPlayer = {
	code: string;
	displayName: string;
	accountEmail: string | null;
	homeClub: string | null;
	privacy: PrivacySettings;
};

export type MockDecision = { player: string; decision: 'confirm' | 'dispute' };

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
};

export type MockToken = { key: string; kind: 'verify_email' | 'reset_password'; email: string };

/** A message the backend would have emailed. Read it with `store.state.outbox`. */
export type MockMail = {
	kind: 'verify_email' | 'reset_password' | 'account_exists';
	to: string;
	/** The key in the link, when the mail has one. */
	key: string | null;
};

export type MockState = {
	accounts: MockAccount[];
	players: MockPlayer[];
	matches: MockMatch[];
	ratings: Record<string, PlayerRatingsOut>;
	/** The signed-in account's email, and when it signed in (seconds since the epoch). */
	session: { email: string; at: number } | null;
	/** A sign-up or login waiting on email verification, in this browser session. */
	pendingEmail: string | null;
	/** The backend's session flag after an under-13 sign-up: later sign-ups are refused too. */
	signupRefused?: boolean;
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

export type FieldIssue = { field: string; code: string; message: string };

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
	const ratings: Record<string, PlayerRatingsOut> = {};
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
			homeClub: p.homeClub,
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
			decisions: m.decisions.map((d) => ({ player: code(d.player), decision: d.decision }))
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

		logout(): void {
			state.session = null;
			state.pendingEmail = null;
		},

		/**
		 * allauth's sign-up with `ACCOUNT_PREVENT_ENUMERATION`: a taken address gets the same
		 * answer as a new one, and its owner is mailed that an account exists.
		 */
		signup(email: string, password: string): void {
			const normalized = normalizeEmail(email);
			if (accountByEmail(normalized)) {
				sendMail('account_exists', normalized);
			} else {
				state.accounts.push({ email: normalized, password, verified: false, active: true });
				sendMail('verify_email', normalized);
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

		// Players (provisional endpoints, backend#124 and #53)

		myPlayerOut(player: MockPlayer): MyPlayerOut {
			return {
				code: player.code,
				display_name: player.displayName,
				home_club: player.homeClub,
				privacy: { ...player.privacy }
			};
		},

		createMyPlayer(email: string, input: MyPlayerCreateIn): MockPlayer {
			// A stand-in account (`missing` mode) has no row yet. An empty password never matches a login.
			if (!accountByEmail(email)) {
				state.accounts.push({ email, password: '', verified: true, active: true });
			}
			const player: MockPlayer = {
				code: buildCode('player', counterCode(nextCounter(), 7, 'NEW')),
				displayName: input.display_name.trim(),
				accountEmail: email,
				homeClub: input.home_club?.trim() || null,
				privacy: {
					city_region_visibility: 'signed_in',
					match_history_visibility: 'signed_in',
					rating_history_visibility: 'signed_in',
					stats_visibility: 'signed_in',
					home_club_visibility: 'signed_in'
				}
			};
			state.players.push(player);
			return player;
		},

		updateMyPlayer(player: MockPlayer, input: MyPlayerUpdateIn): void {
			if (input.display_name !== undefined) player.displayName = input.display_name.trim();
			if (input.home_club !== undefined) player.homeClub = input.home_club?.trim() || null;
			if (input.privacy) Object.assign(player.privacy, input.privacy);
		},

		/**
		 * A player's public profile, or undefined when it is hidden (inactive account).
		 * Like `PlayerPrivacy.visible_to`, the home club goes to the owner, or to an active
		 * signed-in viewer when the setting is `signed_in`. Signed-out callers never get it.
		 */
		publicProfile(code: string, viewerEmail: string | null): PlayerProfileOut | undefined {
			const player = playerByCode(code);
			if (!player || !this.isListed(player)) return undefined;
			const viewer = viewerEmail ? accountByEmail(viewerEmail) : undefined;
			const showClub =
				viewer?.active === true &&
				(viewer.email === player.accountEmail ||
					player.privacy.home_club_visibility === 'signed_in');
			return {
				code: player.code,
				display_name: player.displayName,
				home_club: showClub ? player.homeClub : null
			};
		},

		/** Whether the public may see this player at all: the account must be active. */
		isListed(player: MockPlayer): boolean {
			const account = player.accountEmail ? accountByEmail(player.accountEmail) : undefined;
			return account?.active ?? false;
		},

		ratingsFor(code: string): PlayerRatingsOut | undefined {
			const player = playerByCode(code);
			if (!player || !this.isListed(player)) return undefined;
			return state.ratings[code] ?? { ratings: {}, demonstration: true };
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
		 * an unknown code or not, gets undefined (a 404 in the API). Organizers and moderators
		 * get no more than other accounts.
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
		 * a player (422), the score rules (422), then the duplicate check (409).
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
				decisions: []
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
			const added = record('dispute');
			if (added && match.status !== 'disputed') match.status = 'disputed';
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
