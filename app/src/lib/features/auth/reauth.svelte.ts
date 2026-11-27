/**
 * Reauthentication: some calls need the player to confirm it is them first (turning two-factor
 * on or off, new recovery codes, and later deleting the account). The backend says so with an
 * allauth 401 listing `reauthenticate` or `mfa_reauthenticate`, or an OPEN 403
 * `reauthentication_required`. `withReauth` catches that, opens the one prompt
 * (`ReauthPrompt`, in the root layout), and sends the call once more after the player confirms.
 */
import { isAppError, reauthFlowsOf, type ReauthMethod } from '#lib/api/index.js';
import { session } from './session.svelte.js';

/** The player closed the prompt. Nothing changed, so callers show no error. */
export class ReauthCancelled extends Error {
	constructor() {
		super('Reauthentication was cancelled.');
		this.name = 'ReauthCancelled';
	}
}

/** The prompt's state. `ReauthPrompt` shows it while `request` is set. */
class ReauthPromptStore {
	/** The open request: the ways the player may confirm, the first one shown first. */
	request = $state<{ methods: ReauthMethod[] } | null>(null);
	#pending: Promise<boolean> | null = null;
	#resolve: ((ok: boolean) => void) | null = null;

	/** Open the prompt, or join the one already open. */
	open(methods: ReauthMethod[]): Promise<boolean> {
		if (this.#pending) return this.#pending;
		this.request = { methods };
		this.#pending = new Promise<boolean>((resolve) => (this.#resolve = resolve));
		return this.#pending;
	}

	/** Close the prompt: true after a reauthentication, false on Cancel. */
	settle(ok: boolean): void {
		const resolve = this.#resolve;
		this.request = null;
		this.#pending = null;
		this.#resolve = null;
		resolve?.(ok);
	}
}

export const reauthPrompt = new ReauthPromptStore();

/**
 * Ask the player to confirm it is them. Resolves true after they did, false when they cancelled.
 * A code is not offered to an account known to have no two-factor, unless it is the only way.
 */
export function requestReauth(methods: ReauthMethod[]): Promise<boolean> {
	const usable =
		session.mfaEnrolled === false ? methods.filter((method) => method !== 'code') : methods;
	return reauthPrompt.open(usable.length > 0 ? usable : methods);
}

/**
 * Run `call`. When the backend asks for a reauthentication, ask the player, then run `call` once
 * more. A second refusal is thrown as it is. On Cancel it throws `ReauthCancelled`.
 */
export async function withReauth<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		const methods = isAppError(error) ? reauthFlowsOf(error) : null;
		if (!methods) throw error;
		if (!(await requestReauth(methods))) throw new ReauthCancelled();
		return call();
	}
}
