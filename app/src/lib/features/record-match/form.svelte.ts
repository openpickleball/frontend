/**
 * The state of the "Record a match" form, built with runes.
 *
 * The form holds what the player typed: chips for the players, text for the scores. `input` turns
 * that into a `MatchInput` for the domain rules, so the same rules run here as on the backend.
 * Every error is keyed like the backend's 422 fields (`played_on`, `team_b.0`, `games.1`), so a
 * client-side issue and a server-side one land on the same field.
 */
import { MFA_REQUIRED, isAppError, type AppError } from '#lib/api/index.js';
import {
	MAX_GAMES,
	groupIssues,
	parsePlayerCode,
	todayLocal,
	validateMatch,
	type FieldErrors,
	type GameTarget,
	type MatchFormat,
	type MatchInput,
	type PlayerCode,
	type ScoringType
} from '#lib/domain/index.js';
import type { Draft } from './draft.js';
import { looksLikeCode } from './search.js';
import { duplicateMatchCode, submitMatch, type SubmitResult } from './service.js';

/** Keeps a match on the device to send later. Rejects when it can't. */
export type QueueFn = (input: MatchInput, own: PlayerCode, form: Draft) => Promise<void>;

/** One place for a player's OPEN code: a chip once it checks out, a text box until then. */
export type Slot = { code: PlayerCode | null; name: string; text: string; error: string };
/** One game's scores as typed. */
export type GameRow = { a: string; b: string };

/** The values a server error is matched against, as they were at one moment. */
type FormView = {
	playedOn: string;
	format: string;
	gameTarget: number;
	scoringType: string;
	games: GameRow[];
	own: string;
	partner: string;
	opponents: string[];
	input: string;
};

/** An entry in the error summary. `target` is the id of the field to focus, if there is one. */
export type SummaryEntry = { key: string; message: string; target: string | null };

/** What went wrong when sending, other than a field error. */
export type Failure =
	| { kind: 'offline'; message: string }
	| { kind: 'duplicate'; message: string; matchCode: string | null }
	/** The backend refused this player as the submitter. */
	| { kind: 'forbidden'; message: string }
	/** A correction the backend answered with 404: in practice, a match played at an event. */
	| { kind: 'organizer'; message: string }
	/** A correction the backend answered with 409: the match is no longer pending or disputed. */
	| { kind: 'conflict'; message: string }
	| { kind: 'other'; message: string };

export const OFFLINE_MESSAGE = 'We lost the connection. Your match may not have been saved.';
export const FORBIDDEN_MESSAGE =
	"We couldn't record this match. You can only record a match you played in.";
export const CORRECT_FORBIDDEN_MESSAGE =
	"We couldn't correct this match. You can only correct a match you played in.";
/**
 * `correct_match` answers 404 for a match with an event or a club. `MatchOut` now sends both
 * (backend#302), but the app does not read them yet, so it explains the 404 instead of hiding the
 * button. frontend#264 will use them to hide it.
 */
export const ORGANIZER_ONLY_MESSAGE = 'This match can only be changed by its organizer';
export const CORRECT_CONFLICT_MESSAGE = "This match can't be corrected now";
export const DUPLICATE_MESSAGE = 'This match was already recorded';

const emptySlot = (): Slot => ({ code: null, name: '', text: '', error: '' });

/**
 * A game's score text as a number. A leading minus is kept, so the rules can say a score cannot be
 * negative. Anything else that is not a whole number becomes NaN, which the rules refuse.
 */
function scoreOf(text: string): number {
	const trimmed = text.trim();
	return /^-?\d{1,3}$/.test(trimmed) ? Number(trimmed) : NaN;
}

/** Dates before this get a hint to check the year. The backend sets no earliest date, so it is only a hint. */
export const HINT_BEFORE_DATE = '2000-01-01';

/** The `games.<i>` bucket a game error belongs to, so `games.1.team_a` shows with `games.1`. */
function bucket(key: string): string {
	const found = /^games\.(\d+)(?:\.|$)/.exec(key);
	return found ? `games.${found[1]}` : key;
}

function order(key: string): number {
	if (key === 'played_on') return 0;
	if (key === 'format') return 1;
	if (key.startsWith('team_a')) return 2;
	if (key.startsWith('team_b')) return 3;
	if (key === 'game_target' || key === 'scoring_type') return 4;
	if (key === 'games') return 5;
	const game = /^games\.(\d+)$/.exec(key);
	if (game) return 6 + Number(game[1]) / 10;
	return 9;
}

export class RecordForm {
	/** The signed-in player's own code. Always on team A, and cannot be removed. */
	readonly own: PlayerCode;

	format = $state<MatchFormat>('doubles');
	playedOn = $state(todayLocal());
	gameTarget = $state<GameTarget>(11);
	scoringType = $state<ScoringType>('side_out');
	partner = $state<Slot>(emptySlot());
	opponents = $state<[Slot, Slot]>([emptySlot(), emptySlot()]);
	games = $state<GameRow[]>([{ a: '', b: '' }]);

	/** Set once the player has tried to submit: every error shows from then on. */
	submitted = $state(false);
	sending = $state(false);
	failure = $state<Failure | null>(null);
	#touched = $state<Record<string, boolean>>({});
	/**
	 * The backend's field errors. Each one is kept with the value of its own field when the server
	 * answered, and is dropped once that field changes. Other edits leave it alone.
	 */
	#server = $state<{ fields: FieldErrors; values: Record<string, string> } | null>(null);

	/**
	 * True when the form corrects a match. The players and the format are the match's and can't
	 * change (a correction keeps the same two teams), and a 404 or 409 reads as a correction's.
	 */
	readonly correcting: boolean;

	constructor(own: PlayerCode, { correcting = false }: { correcting?: boolean } = {}) {
		this.own = own;
		this.correcting = correcting;
	}

	/** What the player has entered, in a shape that can be kept and put back with `restore`. */
	get draft(): Draft {
		const slot = (s: Slot) => ({ code: s.code, name: s.code ? s.name : '' });
		return {
			format: this.format,
			playedOn: this.playedOn,
			gameTarget: this.gameTarget,
			scoringType: this.scoringType,
			partner: slot(this.partner),
			opponents: [slot(this.opponents[0]), slot(this.opponents[1])],
			games: this.games.map((g) => ({ a: g.a, b: g.b }))
		};
	}

	/** Put a kept draft back. A code that is the player's own or is repeated is left out. */
	restore(draft: Draft): void {
		const seen: string[] = [this.own];
		const fill = (target: Slot, from: { code: PlayerCode | null; name: string }) => {
			const usable = from.code !== null && !seen.includes(from.code);
			if (usable) seen.push(from.code!);
			target.code = usable ? from.code : null;
			target.name = usable ? from.name : '';
		};
		this.format = draft.format;
		this.playedOn = draft.playedOn;
		this.gameTarget = draft.gameTarget;
		this.scoringType = draft.scoringType;
		fill(this.partner, draft.partner);
		fill(this.opponents[0], draft.opponents[0]);
		fill(this.opponents[1], draft.opponents[1]);
		this.games = draft.games.map((g) => ({ ...g }));
	}

	get doubles(): boolean {
		return this.format === 'doubles';
	}

	/** The opponent slots in use. */
	get visibleOpponents(): Slot[] {
		return this.doubles ? [this.opponents[0], this.opponents[1]] : [this.opponents[0]];
	}

	get canAddGame(): boolean {
		return this.games.length < MAX_GAMES;
	}

	get canRemoveGame(): boolean {
		return this.games.length > 1;
	}

	/** What the domain rules and the service take. */
	get input(): MatchInput {
		const teamA = [this.own, ...(this.doubles && this.partner.code ? [this.partner.code] : [])];
		const teamB = this.visibleOpponents.flatMap((slot) => (slot.code ? [slot.code] : []));
		return {
			format: this.format,
			playedOn: this.playedOn,
			teamA,
			teamB,
			games: this.games.map((g) => ({ teamA: scoreOf(g.a), teamB: scoreOf(g.b) })),
			gameTarget: this.gameTarget,
			scoringType: this.scoringType
		};
	}

	/** Players still to add. These only show once the player has tried to submit. */
	get #missing(): FieldErrors {
		const missing: FieldErrors = {};
		if (this.doubles && !this.partner.code) {
			missing['team_a.1'] = ["Add your partner's OPEN code."];
		}
		this.visibleOpponents.forEach((slot, index) => {
			if (slot.code) return;
			const who = !this.doubles
				? 'your opponent'
				: index === 0
					? 'the first opponent'
					: 'the second opponent';
			missing[`team_b.${index}`] = [`Add ${who}'s OPEN code.`];
		});
		return missing;
	}

	/** Problems with codes that were typed but did not check out. */
	get #typed(): FieldErrors {
		const typed: FieldErrors = {};
		if (this.doubles && this.partner.error) typed['team_a.1'] = [this.partner.error];
		this.visibleOpponents.forEach((slot, index) => {
			if (slot.error) typed[`team_b.${index}`] = [slot.error];
		});
		return typed;
	}

	/** The domain rules' issues, minus team sizes, which `#missing` words better for chips. */
	get #rules(): FieldErrors {
		const result = validateMatch(this.input);
		const issues = result.ok ? [] : result.error.filter((issue) => issue.code !== 'team_size');
		const rules = groupIssues(
			issues.map((issue) => {
				const game = /^games\.(\d+)$/.exec(issue.field);
				if (!game || issue.code !== 'invalid_score') return issue;
				const row = this.games[Number(game[1])];
				if (row && (row.a.trim() === '' || row.b.trim() === '')) {
					return { ...issue, message: `Game ${Number(game[1]) + 1}: enter both scores.` };
				}
				return issue;
			})
		);
		// The rules allow a day of slack for time zones. The form holds to the player's own today.
		if (!rules.played_on && this.playedOn > todayLocal()) {
			rules.played_on = ['The date played cannot be in the future.'];
		}
		return rules;
	}

	/**
	 * A hint, never an error, for a date that is a valid date but long ago. The backend accepts any
	 * past date, so this does not block recording the match.
	 */
	get dateHint(): string | null {
		const valid = /^\d{4}-\d{2}-\d{2}$/.test(this.playedOn) && !this.#rules.played_on;
		if (!valid || this.playedOn >= HINT_BEFORE_DATE) return null;
		return 'Check the year. This date is more than 25 years ago.';
	}

	/** The values the error matching reads, copied so a later edit cannot change them. */
	#view(): FormView {
		return {
			playedOn: this.playedOn,
			format: this.format,
			gameTarget: this.gameTarget,
			scoringType: this.scoringType,
			games: this.games.map((g) => ({ ...g })),
			own: this.own,
			partner: this.partner.code ?? '',
			opponents: [this.opponents[0].code ?? '', this.opponents[1].code ?? ''],
			input: JSON.stringify(this.input)
		};
	}

	/** The value a server error key answered, so the error can go when that value changes. */
	#valueOf(key: string, v: FormView = this.#view()): string {
		if (key === 'played_on') return v.playedOn;
		if (key === 'format') return v.format;
		if (key === 'game_target') return String(v.gameTarget);
		if (key === 'scoring_type') return v.scoringType;
		if (key === 'games') return JSON.stringify(v.games);
		const game = /^games\.(\d+)(?:\.|$)/.exec(key);
		if (game) return JSON.stringify(v.games[Number(game[1])] ?? null);
		const team = /^team_([ab])(?:\.(\d+))?$/.exec(key);
		if (team) {
			const side = team[1] === 'a' ? [v.own, v.partner] : v.opponents;
			const value = team[2] === undefined ? side : [side[Number(team[2])] ?? ''];
			return `${v.format}:${value.join(',')}`;
		}
		// A key we do not know goes when anything changes.
		return v.input;
	}

	/** The server's errors, each kept while its own field is still what the server answered. */
	get serverErrors(): FieldErrors {
		if (!this.#server) return {};
		const kept: FieldErrors = {};
		for (const [key, messages] of Object.entries(this.#server.fields)) {
			if (this.#server.values[key] === this.#valueOf(key)) kept[key] = messages;
		}
		return kept;
	}

	/** Every error to show now, by field key, with game errors grouped under `games.<i>`. */
	get errors(): FieldErrors {
		const shown: FieldErrors = {};
		const add = (key: string, messages: string[]) => {
			const into = (shown[bucket(key)] ??= []);
			for (const message of messages) if (!into.includes(message)) into.push(message);
		};
		for (const [key, messages] of Object.entries(this.#typed)) add(key, messages);
		for (const [key, messages] of Object.entries(this.serverErrors)) add(key, messages);
		for (const [key, messages] of Object.entries(this.#rules)) {
			if (this.submitted || this.#touched[bucket(key)]) add(key, messages);
		}
		if (this.submitted) {
			for (const [key, messages] of Object.entries(this.#missing)) {
				if (!shown[key]) add(key, messages);
			}
		}
		return shown;
	}

	/** The error summary, in page order. One line per field. */
	get summary(): SummaryEntry[] {
		return Object.entries(this.errors)
			.sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
			.map(([key, messages]) => ({ key, message: messages[0], target: this.targetFor(key) }));
	}

	/** The id of the field an error belongs to. Null for an error about the form as a whole. */
	targetFor(key: string): string | null {
		if (key === 'played_on') return 'played-on';
		if (key === 'team_a.1' || key === 'team_a') return this.doubles ? 'partner' : 'opponent-0';
		const opponent = /^team_b(?:\.(\d+))?$/.exec(key);
		if (opponent) return `opponent-${Math.min(Number(opponent[1] ?? 0), this.doubles ? 1 : 0)}`;
		if (key === 'games') return 'game-0-a';
		const game = /^games\.(\d+)$/.exec(key);
		if (game) return `game-${game[1]}-a`;
		return null;
	}

	/** A field has been left: show its rule errors from now on. */
	touch(key: string): void {
		this.#touched[bucket(key)] = true;
	}

	// Players

	/** Turn what was typed into a chip, or say what is wrong with it. Empty text is left alone. */
	commit(slot: Slot): boolean {
		const text = slot.text.trim();
		if (text === '') {
			slot.error = '';
			return false;
		}
		const parsed = parsePlayerCode(text);
		if (!parsed.ok) {
			slot.error = looksLikeCode(text)
				? parsed.error.message
				: 'Pick a player from the list, or enter their OPEN code.';
			return false;
		}
		// Only the slots in use count. Singles ignores a partner or second opponent entered before.
		const taken = [
			this.own,
			...(this.doubles ? [this.partner.code] : []),
			...this.visibleOpponents.map((s) => s.code)
		];
		if (taken.includes(parsed.value)) {
			slot.error = 'This player is already in the match.';
			return false;
		}
		slot.code = parsed.value;
		slot.name = '';
		slot.text = '';
		slot.error = '';
		return true;
	}

	/** Fill a slot with a player found by name. A player already in the match is refused like a typed code. */
	choose(slot: Slot, hit: { code: PlayerCode; name: string }): boolean {
		slot.text = hit.code;
		if (!this.commit(slot)) return false;
		slot.name = hit.name;
		return true;
	}

	/** Every code in the match, for the slots to leave out of their search results. */
	get taken(): string[] {
		return [
			this.own,
			...(this.doubles && this.partner.code ? [this.partner.code] : []),
			...this.visibleOpponents.flatMap((s) => (s.code ? [s.code] : []))
		];
	}

	remove(slot: Slot): void {
		slot.code = null;
		slot.name = '';
		slot.text = '';
		slot.error = '';
	}

	/** Chip any code still waiting in a text box, so a submit never ignores one. */
	commitAll(): void {
		const slots = this.doubles ? [this.partner, ...this.visibleOpponents] : this.visibleOpponents;
		for (const slot of slots) this.commit(slot);
	}

	// Games

	addGame(): boolean {
		if (!this.canAddGame) return false;
		this.games.push({ a: '', b: '' });
		return true;
	}

	removeGame(index: number): void {
		if (!this.canRemoveGame) return;
		this.games.splice(index, 1);
	}

	// Sending

	/**
	 * Show the backend's field errors for a match it refused earlier, as if it had just answered.
	 * For a queued match the player opens to fix.
	 */
	showServerErrors(fields: FieldErrors): void {
		this.submitted = true;
		const view = this.#view();
		this.#server = {
			fields,
			values: Object.fromEntries(Object.keys(fields).map((k) => [k, this.#valueOf(k, view)]))
		};
	}

	/**
	 * Check, then send. Returns the result when the match was recorded, or `'queued'` when there
	 * was no connection and `queue` kept it on the device (never for a correction). Otherwise the
	 * reason is on the form: `errors` for fields, `failure` for the rest. The form stays filled.
	 */
	async send(
		submit: typeof submitMatch = submitMatch,
		queue?: QueueFn
	): Promise<SubmitResult | 'queued' | null> {
		if (this.sending) return null;
		this.submitted = true;
		this.failure = null;
		this.commitAll();
		if (this.summary.length > 0) return null;

		this.sending = true;
		// What was sent. A 422 belongs to these values, not to edits made while it was in flight.
		const sent = this.#view();
		const input = this.input;
		const draft = this.draft;
		try {
			return await submit(input, this.own);
		} catch (cause) {
			if (queue && !this.correcting && isAppError(cause) && cause.kind === 'network') {
				try {
					await queue(input, this.own, draft);
					return 'queued';
				} catch {
					// Not kept on the device: say the connection was lost, as without a queue.
				}
			}
			this.#fail(cause, sent);
			return null;
		} finally {
			this.sending = false;
		}
	}

	#fail(cause: unknown, sent: FormView): void {
		if (!isAppError(cause)) {
			this.failure = { kind: 'other', message: 'Something went wrong. Try again.' };
			return;
		}
		const error: AppError = cause;
		switch (error.kind) {
			case 'network':
				this.failure = { kind: 'offline', message: OFFLINE_MESSAGE };
				return;
			case 'duplicate':
				this.failure = {
					kind: 'duplicate',
					message: DUPLICATE_MESSAGE,
					matchCode: duplicateMatchCode(error)
				};
				return;
			case 'validation': {
				this.#server = {
					fields: error.fields,
					values: Object.fromEntries(
						Object.keys(error.fields).map((k) => [k, this.#valueOf(k, sent)])
					)
				};
				// A 422 with no field we can show still has to say something.
				if (Object.keys(error.fields).length === 0) {
					this.failure = { kind: 'other', message: error.message };
				}
				return;
			}
			case 'forbidden':
				// Two-factor is needed, or this session has not passed it: say that, not a refusal.
				if (error.code === MFA_REQUIRED) {
					this.failure = { kind: 'other', message: error.message };
					return;
				}
				// The CSRF case has its own kind. This is a refusal of the submitter.
				if (this.correcting) {
					this.failure = { kind: 'forbidden', message: CORRECT_FORBIDDEN_MESSAGE };
					return;
				}
				this.failure =
					error.code === 'forbidden'
						? { kind: 'forbidden', message: FORBIDDEN_MESSAGE }
						: { kind: 'other', message: error.message };
				return;
			case 'not_found':
				if (this.correcting) {
					this.failure = { kind: 'organizer', message: ORGANIZER_ONLY_MESSAGE };
					return;
				}
				this.failure = { kind: 'other', message: error.message };
				return;
			case 'conflict':
				if (this.correcting) {
					this.failure = { kind: 'conflict', message: CORRECT_CONFLICT_MESSAGE };
					return;
				}
				this.failure = { kind: 'other', message: error.message };
				return;
			default:
				this.failure = { kind: 'other', message: error.message };
		}
	}
}
