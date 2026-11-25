import { isAppError } from '#lib/api/index.js';
import { parsePlayerCode, type CodeError, type PlayerCode } from '#lib/domain/index.js';
import { currentAccountEmail } from './account.js';
import {
	createMyPlayer,
	fetchMyPlayer,
	type CreateMyPlayerResult,
	type PlayerCreateIn
} from './services.js';
import { createCodeStore, type CodeStore } from './storage.js';
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
 * - `needs-entry`: signed in, against a backend without the create, and no code yet. Show the
 *   one-time prompt.
 * - `signed-out`: nobody is signed in.
 * - `error`: the backend failed, or could not be reached and no code is saved on this device.
 */
export type MyCodeStatus =
	| 'idle'
	| 'loading'
	| 'ready'
	| 'needs-details'
	| 'refused'
	| 'unverified'
	| 'not-created'
	| 'needs-entry'
	| 'signed-out'
	| 'error';

/** `server` came from `me/player`. `device` was typed in and is kept in localStorage. */
export type MyCodeSource = 'server' | 'device';

export type MyCodeDeps = {
	/** `'none'` for no player yet, `'unavailable'` for no endpoint. Throws an `AppError` otherwise. */
	fetchMyPlayer: () => Promise<MyPlayer | 'none' | 'unavailable'>;
	/** `POST me/player`. Throws an `AppError` for a 401, 403, 5xx or no answer. */
	createMyPlayer: (body?: PlayerCreateIn) => Promise<CreateMyPlayerResult>;
	accountEmail: () => Promise<string | null>;
	store: CodeStore;
};

export type SaveError = CodeError | { reason: 'server_code'; message: string };
export type SaveResult = { ok: true; code: PlayerCode } | { ok: false; error: SaveError };

/** The fields of the details form. A 422 on any other field is shown as `detailProblem`. */
export const DETAIL_FIELDS = ['birth_month', 'birth_year', 'gender_division', 'display_name'];

const SUBMIT_FAILED = 'Something went wrong on our side. Wait a moment, then try again.';

/**
 * The signed-in player's own OPEN code (Decision Q3, plans/frontend-v1/plan.md, and backend#124).
 *
 * `load()` asks `GET me/player`. An account with a player gets its code from the server. An
 * account with none (a 404) gets one: `load()` sends `POST me/player` with `{}`, and the backend
 * creates the player from the details it holds from sign-up. When it holds none, the status is
 * `needs-details`, and `submitDetails()` sends them. An age refusal is `refused`, and a 403
 * (email not verified) is `unverified`. A 409 means the player exists already, so it is read
 * again. At most one create is in flight at a time, and a late answer never overwrites a newer
 * load.
 *
 * Only against a backend older than backend#124 (a 405 from the GET, or a 404 or 405 from the
 * create), or when the server can't be reached, does it read the code the player typed in
 * earlier, kept in localStorage under a key for their account email. If there is none, `status`
 * becomes `needs-entry` (or `error` when the server could not be reached).
 *
 * It is a singleton, so call `reset()` on sign-in and sign-out: it must never hold the previous
 * account's code or details.
 */
export class MyCode {
	status = $state<MyCodeStatus>('idle');
	code = $state<PlayerCode | null>(null);
	source = $state<MyCodeSource | null>(null);
	displayName = $state<string | null>(null);
	/** The account the code belongs to, when known. */
	email = $state<string | null>(null);
	/** True while the player is replacing a code they entered earlier. */
	editing = $state(false);
	/** Set when the code could not be saved on this device. */
	storageFailed = $state(false);
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

	/** Whether to show the entry prompt: no code yet, or the player asked to change it. */
	get prompting(): boolean {
		return this.status === 'needs-entry' || (this.status === 'ready' && this.editing);
	}

	/** The player can replace a code only when it came from this device. */
	get canChange(): boolean {
		return this.status === 'ready' && this.source === 'device';
	}

	/**
	 * Find the code, creating the player when the account has none. `email` is the signed-in
	 * account's email when the caller already knows it; otherwise it comes from the account
	 * source (`account.ts`). Safe to call again.
	 */
	async load(email?: string | null): Promise<void> {
		const run = ++this.#run;
		this.status = 'loading';
		this.editing = false;
		this.storageFailed = false;
		this.detailErrors = {};
		this.detailProblem = null;

		let failed = false;
		try {
			const found = await this.#deps.fetchMyPlayer();
			if (run !== this.#run) return;
			if (found === 'none') {
				const created = await this.#create({});
				if (run !== this.#run) return;
				if (await this.#settle(run, created, email ?? null)) return;
			} else if (found !== 'unavailable') {
				this.#ready(found, email ?? null);
				return;
			}
		} catch (error) {
			if (run !== this.#run) return;
			const status = failureStatus(error);
			if (status) {
				this.#clear(status);
				return;
			}
			failed = true;
		}
		await this.#fromDevice(run, email, failed);
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
			if (await this.#settle(run, result, this.email)) return;
			await this.#fromDevice(run, this.email, false);
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

	/** Check what the player typed. On success, keep the code on this device and show it. */
	save(raw: string): SaveResult {
		if (this.source === 'server') {
			return {
				ok: false,
				error: { reason: 'server_code', message: 'Your OPEN code comes from your account.' }
			};
		}
		const parsed = parsePlayerCode(raw);
		if (!parsed.ok) return { ok: false, error: parsed.error };
		this.storageFailed = !this.email || !this.#deps.store.write(this.email, parsed.value);
		this.#set(parsed.value, 'device', null);
		return { ok: true, code: parsed.value };
	}

	/**
	 * Sign out: delete the code saved on this device for `email` (default: the loaded account),
	 * then forget everything. Pass the session's email, because this store only knows the account
	 * after the profile has loaded.
	 */
	forget(email: string | null = this.email): void {
		if (email) this.#deps.store.remove(email);
		this.reset();
	}

	/** Forget everything, including the account, and drop loads and creates still in flight. */
	reset(): void {
		this.#run++;
		this.#creating = null;
		this.detailErrors = {};
		this.detailProblem = null;
		this.code = null;
		this.source = null;
		this.displayName = null;
		this.email = null;
		this.editing = false;
		this.storageFailed = false;
		this.status = 'idle';
	}

	/** Show a display name the player just saved. Only a code from the server has one. */
	rename(displayName: string): void {
		if (this.source === 'server') this.displayName = displayName;
	}

	/** Start replacing the code. `cancel()` goes back to the old one. */
	change(): void {
		if (this.canChange) this.editing = true;
	}

	cancel(): void {
		this.editing = false;
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

	/**
	 * Show what a create answered. False for `unavailable` (no create on this backend), so the
	 * caller falls back to the device. Throws what a second `GET me/player` throws.
	 */
	async #settle(run: number, result: CreateMyPlayerResult, email: string | null): Promise<boolean> {
		switch (result.kind) {
			case 'created':
				this.#ready(result.player, email);
				return true;
			case 'conflict': {
				// Another tab or request made the player: read it.
				const again = await this.#deps.fetchMyPlayer();
				if (run !== this.#run) return true;
				if (typeof again === 'object') this.#ready(again, email);
				else this.#clear('error');
				return true;
			}
			case 'needs-details':
				this.#clear('needs-details');
				return true;
			case 'refused':
				this.#clear('refused');
				return true;
			case 'invalid':
				this.#clear('not-created');
				return true;
			case 'unavailable':
				return false;
		}
	}

	/** The code typed in on this device, for a backend without the create, or offline. */
	async #fromDevice(run: number, email: string | null | undefined, failed: boolean): Promise<void> {
		let account: string | null;
		try {
			account = email ?? (await this.#deps.accountEmail());
		} catch {
			if (run !== this.#run) return;
			this.#clear('error');
			return;
		}
		if (run !== this.#run) return;
		this.email = account;
		if (!account) {
			this.#clear(failed ? 'error' : 'signed-out');
			return;
		}
		const stored = this.#deps.store.read(account);
		if (stored) this.#set(stored, 'device', null);
		else this.#clear(failed ? 'error' : 'needs-entry');
	}

	#ready(player: MyPlayer, email: string | null): void {
		this.#set(player.code, 'server', player.displayName);
		this.email = email;
	}

	#set(code: PlayerCode, source: MyCodeSource, displayName: string | null): void {
		this.code = code;
		this.source = source;
		this.displayName = displayName;
		this.editing = false;
		this.status = 'ready';
	}

	#clear(status: MyCodeStatus): void {
		this.code = null;
		this.source = null;
		this.displayName = null;
		this.status = status;
	}
}

/**
 * The status a failure ends in, or null for a network failure, which falls back to the code
 * saved on this device.
 */
function failureStatus(error: unknown): MyCodeStatus | null {
	if (!isAppError(error)) return 'error';
	if (error.kind === 'unauthenticated') return 'signed-out';
	if (error.kind === 'forbidden') return 'unverified';
	if (error.kind === 'network') return null;
	return 'error';
}

export function createMyCode(deps: Partial<MyCodeDeps> = {}): MyCode {
	return new MyCode({
		fetchMyPlayer: deps.fetchMyPlayer ?? (() => fetchMyPlayer()),
		createMyPlayer: deps.createMyPlayer ?? ((body) => createMyPlayer(body)),
		accountEmail: deps.accountEmail ?? currentAccountEmail,
		store: deps.store ?? createCodeStore()
	});
}

/** The app-wide store. */
export const myCode = createMyCode();
