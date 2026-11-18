import { isAppError } from '#lib/api/index.js';
import { parsePlayerCode, type CodeError, type PlayerCode } from '#lib/domain/index.js';
import { currentAccountEmail } from './account.js';
import { fetchMyPlayer } from './services.js';
import { createCodeStore, type CodeStore } from './storage.js';
import type { MyPlayer } from './types.js';

/**
 * - `idle`: `load()` has not run.
 * - `loading`: asking the backend.
 * - `ready`: `code` is set.
 * - `needs-entry`: signed in, and no code yet. Show the one-time prompt.
 * - `signed-out`: nobody is signed in.
 * - `error`: the backend could not be reached and no code is saved on this device.
 */
export type MyCodeStatus = 'idle' | 'loading' | 'ready' | 'needs-entry' | 'signed-out' | 'error';

/** `server` came from `GET me/player`. `device` was typed in and is kept in localStorage. */
export type MyCodeSource = 'server' | 'device';

export type MyCodeDeps = {
	/** `null` when `me/player` is not available. Throws an `AppError` for other failures. */
	fetchMyPlayer: () => Promise<MyPlayer | null>;
	accountEmail: () => Promise<string | null>;
	store: CodeStore;
};

export type SaveError = CodeError | { reason: 'server_code'; message: string };
export type SaveResult = { ok: true; code: PlayerCode } | { ok: false; error: SaveError };

/**
 * The signed-in player's own OPEN code (Decision Q3, plans/frontend-v1/plan.md).
 *
 * `load()` asks `GET me/player` first. If the backend has no such endpoint (404 or 405), or the
 * account has no player yet, it reads the code the player typed in earlier, kept in
 * localStorage under a key for their account email. If there is none, `status` becomes
 * `needs-entry`. Once `me/player` ships, an account that has a player always gets its code from
 * the server. An account with no player yet (a 404) is still prompted.
 *
 * It is a singleton, so call `reset()` on sign-in and sign-out: it must never hold the previous
 * account's code.
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

	#deps: MyCodeDeps;
	#run = 0;

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
	 * Find the code. `email` is the signed-in account's email when the caller already knows it;
	 * otherwise it comes from the account source (`account.ts`). Safe to call again.
	 */
	async load(email?: string | null): Promise<void> {
		const run = ++this.#run;
		this.status = 'loading';
		this.editing = false;
		this.storageFailed = false;

		let failed = false;
		try {
			const player = await this.#deps.fetchMyPlayer();
			if (run !== this.#run) return;
			if (player) {
				this.#set(player.code, 'server', player.displayName);
				this.email = email ?? null;
				return;
			}
		} catch (error) {
			if (run !== this.#run) return;
			if (isAppError(error) && error.kind === 'unauthenticated') {
				this.#clear('signed-out');
				return;
			}
			failed = true;
		}

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

	/** Forget everything, including the account, and drop loads still in flight. */
	reset(): void {
		this.#run++;
		this.code = null;
		this.source = null;
		this.displayName = null;
		this.email = null;
		this.editing = false;
		this.storageFailed = false;
		this.status = 'idle';
	}

	/** Start replacing the code. `cancel()` goes back to the old one. */
	change(): void {
		if (this.canChange) this.editing = true;
	}

	cancel(): void {
		this.editing = false;
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

export function createMyCode(deps: Partial<MyCodeDeps> = {}): MyCode {
	return new MyCode({
		fetchMyPlayer: deps.fetchMyPlayer ?? fetchMyPlayer,
		accountEmail: deps.accountEmail ?? currentAccountEmail,
		store: deps.store ?? createCodeStore()
	});
}

/** The app-wide store. */
export const myCode = createMyCode();
