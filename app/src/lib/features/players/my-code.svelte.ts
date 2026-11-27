import { MFA_REQUIRED, isAppError } from '#lib/api/index.js';
import type { PlayerCode } from '#lib/domain/index.js';
import {
	createMyPlayer,
	fetchMyPlayer,
	type CreateMyPlayerResult,
	type PlayerCreateIn
} from './services.js';
import type { MyPlayer } from './types.js';

/**
 * - `idle`: `load()` has not run.
 * - `loading`: asking the backend.
 * - `ready`: `code` is set.
 * - `needs-details`: the account has no player, and the backend needs the details it holds from
 *   sign-up (birth month and year, gender division, display name). Show the details form.
 * - `refused`: the backend refused the age. It holds for the session: show no form and no prompt.
 * - `unverified`: the account's email is not verified yet (a 403 from the create).
 * - `not-created`: the create on load was refused for its values (a 422 with nothing missing).
 *   The backend used the details it holds from sign-up, so a form would not help.
 * - `signed-out`: nobody is signed in.
 * - `error`: the backend failed or could not be reached. Show Try again.
 */
export type MyCodeStatus =
	| 'idle'
	| 'loading'
	| 'ready'
	| 'needs-details'
	| 'refused'
	| 'unverified'
	| 'not-created'
	| 'signed-out'
	| 'error';

export type MyCodeDeps = {
	/** `'none'` for no player yet. Throws an `AppError` otherwise. */
	fetchMyPlayer: () => Promise<MyPlayer | 'none'>;
	/** `POST me/player`. Throws an `AppError` for a 401, 403, 404, 405, 5xx or no answer. */
	createMyPlayer: (body?: PlayerCreateIn) => Promise<CreateMyPlayerResult>;
};

/** The fields of the details form. A 422 on any other field is shown as `detailProblem`. */
export const DETAIL_FIELDS = ['birth_month', 'birth_year', 'gender_division', 'display_name'];

const SUBMIT_FAILED = 'Something went wrong on our side. Wait a moment, then try again.';

/**
 * The signed-in player's own OPEN code, from the backend (backend#124).
 *
 * `load()` asks `GET me/player`. An account with a player gets its code from the server. An
 * account with none (a 404) gets one: `load()` sends `POST me/player` with `{}`, and the backend
 * creates the player from the details it holds from sign-up. When it holds none, the status is
 * `needs-details`, and `submitDetails()` sends them. An age refusal is `refused`, and a 403
 * (email not verified) is `unverified`. A 409 means the player exists already, so it is read
 * again. At most one create is in flight at a time, and a late answer never overwrites a newer
 * load.
 *
 * Any other failure is `error`, with Try again: a 5xx, a 405 from the GET, or a 404 or 405 from
 * the create. So is no answer (offline) when no code is known yet. When a code is known from this
 * visit, a load that gets no answer keeps it and the status stays `ready` (frontend#249), so a
 * match can still be queued. A 401, 403 or any other failure clears it. Nothing is kept in the
 * browser, so a code is only shown when the backend sent it.
 *
 * It is a singleton, so call `reset()` on sign-in and sign-out: it must never hold the previous
 * account's code or details.
 */
export class MyCode {
	status = $state<MyCodeStatus>('idle');
	code = $state<PlayerCode | null>(null);
	displayName = $state<string | null>(null);
	/** With `needs-details`: the backend's message per form field after a submit. */
	detailErrors = $state<Record<string, string>>({});
	/** With `needs-details`: why the last submit failed, when no field explains it. */
	detailProblem = $state<string | null>(null);

	#deps: MyCodeDeps;
	#run = 0;
	/** The create in flight, shared by every load and submit until it answers. */
	#creating: Promise<CreateMyPlayerResult> | null = null;

	constructor(deps: MyCodeDeps) {
		this.#deps = deps;
	}

	/** Find the code, creating the player when the account has none. Safe to call again. */
	async load(): Promise<void> {
		const run = ++this.#run;
		// A code from this visit stays on screen while it is asked for again, so the record form
		// stays usable on a weak connection.
		if (this.code === null) this.status = 'loading';
		this.detailErrors = {};
		this.detailProblem = null;

		try {
			const found = await this.#deps.fetchMyPlayer();
			if (run !== this.#run) return;
			if (found === 'none') {
				const created = await this.#create({});
				if (run !== this.#run) return;
				await this.#settle(run, created);
			} else {
				this.#ready(found);
			}
		} catch (error) {
			if (run !== this.#run) return;
			// No answer (offline, or too weak to reply) is not a sign the code is wrong, so a code
			// from this visit stays. It is only in memory, never on the device.
			if (this.code !== null && isAppError(error) && error.kind === 'network') {
				this.status = 'ready';
				return;
			}
			this.#clear(failureStatus(error));
		}
	}

	/**
	 * Send the details the backend asked for (`needs-details`). Field errors from a 422 land in
	 * `detailErrors`, anything else that keeps the form open in `detailProblem`.
	 */
	async submitDetails(body: PlayerCreateIn): Promise<void> {
		if (this.status !== 'needs-details') return;
		const run = this.#run;
		this.detailErrors = {};
		this.detailProblem = null;
		try {
			const result = await this.#create(body);
			if (run !== this.#run) return;
			// On a submit, any 422 shows its messages on the form.
			if (result.kind === 'needs-details' || result.kind === 'invalid') {
				const errors: Record<string, string> = {};
				const others: string[] = [];
				for (const [field, message] of Object.entries(result.fields)) {
					if (DETAIL_FIELDS.includes(field)) errors[field] = message;
					else others.push(message);
				}
				this.detailErrors = errors;
				this.detailProblem = others.length > 0 ? others.join(' ') : null;
				return;
			}
			await this.#settle(run, result);
		} catch (error) {
			if (run !== this.#run) return;
			const status = failureStatus(error);
			if (status === 'signed-out' || status === 'unverified') {
				this.#clear(status);
				return;
			}
			this.detailProblem = isAppError(error) ? error.message : SUBMIT_FAILED;
		}
	}

	/** Forget everything and drop loads and creates still in flight. */
	reset(): void {
		this.#run++;
		this.#creating = null;
		this.detailErrors = {};
		this.detailProblem = null;
		this.code = null;
		this.displayName = null;
		this.status = 'idle';
	}

	/** Show a display name the player just saved. */
	rename(displayName: string): void {
		if (this.status === 'ready') this.displayName = displayName;
	}

	/** The create in flight, or a new one. */
	#create(body: PlayerCreateIn): Promise<CreateMyPlayerResult> {
		if (this.#creating) return this.#creating;
		const creating = this.#deps.createMyPlayer(body).finally(() => {
			if (this.#creating === creating) this.#creating = null;
		});
		this.#creating = creating;
		return creating;
	}

	/** Show what a create answered. Throws what a second `GET me/player` throws. */
	async #settle(run: number, result: CreateMyPlayerResult): Promise<void> {
		switch (result.kind) {
			case 'created':
				this.#ready(result.player);
				return;
			case 'conflict': {
				// Another tab or request made the player: read it.
				const again = await this.#deps.fetchMyPlayer();
				if (run !== this.#run) return;
				if (typeof again === 'object') this.#ready(again);
				else this.#clear('error');
				return;
			}
			case 'needs-details':
				this.#clear('needs-details');
				return;
			case 'refused':
				this.#clear('refused');
				return;
			case 'invalid':
				this.#clear('not-created');
				return;
		}
	}

	#ready(player: MyPlayer): void {
		this.code = player.code;
		this.displayName = player.displayName;
		this.status = 'ready';
	}

	#clear(status: MyCodeStatus): void {
		this.code = null;
		this.displayName = null;
		this.status = status;
	}
}

/** The status a failure ends in. No answer (offline) is an error too: Try again asks again. */
function failureStatus(error: unknown): MyCodeStatus {
	if (!isAppError(error)) return 'error';
	if (error.kind === 'unauthenticated') return 'signed-out';
	// A 403 `mfa_required` is about two-factor, not the email: the generic error explains it.
	if (error.kind === 'forbidden' && error.code !== MFA_REQUIRED) return 'unverified';
	return 'error';
}

export function createMyCode(deps: Partial<MyCodeDeps> = {}): MyCode {
	return new MyCode({
		fetchMyPlayer: deps.fetchMyPlayer ?? (() => fetchMyPlayer()),
		createMyPlayer: deps.createMyPlayer ?? ((body) => createMyPlayer(body))
	});
}

/** The app-wide store. */
export const myCode = createMyCode();
