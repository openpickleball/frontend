/**
 * Reauthentication: some calls need the player to confirm it is them first (turning two-factor
 * on or off, new recovery codes, and deleting the account). The backend says so with an
 * allauth 401 listing `reauthenticate` or `mfa_reauthenticate`, or an OPEN 403
 * `reauthentication_required`. `withReauth` catches that, opens the one prompt
 * (`ReauthPrompt`, in the root layout), and sends the call once more after the player confirms.
 */
import {
	AppError,
	isAppError,
	reauthCodeTypesOf,
	reauthFlowsOf,
	type ReauthCodeType,
	type ReauthMethod
} from '#lib/api/index.js';
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
	/**
	 * The open request: the ways the player may confirm, the first one shown first, and the kinds
	 * of code the code step takes.
	 */
	request = $state<{ id: number; methods: ReauthMethod[]; codeTypes: ReauthCodeType[] } | null>(
		null
	);
	/** Tells one request from the next, so a late answer can't settle a newer one. */
	#nextId = 0;
	/** What the player typed. Kept here, not in the dialog, so every close can clear it. */
	password = $state('');
	code = $state('');
	#pending: Promise<boolean> | null = null;
	#resolve: ((ok: boolean) => void) | null = null;

	/** Open the prompt, or join the one already open and add the ways this call offers. */
	open(methods: ReauthMethod[], codeTypes: ReauthCodeType[]): Promise<boolean> {
		if (this.#pending && this.request) {
			const all = new Set([...this.request.methods, ...methods]);
			const types = new Set([...this.request.codeTypes, ...codeTypes]);
			const order: ReauthMethod[] = ['password', 'code'];
			const typeOrder: ReauthCodeType[] = ['totp', 'recovery_codes'];
			const merged = {
				methods: order.filter((method) => all.has(method)),
				codeTypes: typeOrder.filter((type) => types.has(type))
			};
			const same =
				merged.methods.join() === this.request.methods.join() &&
				merged.codeTypes.join() === this.request.codeTypes.join();
			// Same id: the prompt keeps the player where they are and only offers what was added.
			if (!same) this.request = { id: this.request.id, ...merged };
			return this.#pending;
		}
		this.request = { id: ++this.#nextId, methods, codeTypes };
		this.#pending = new Promise<boolean>((resolve) => (this.#resolve = resolve));
		return this.#pending;
	}

	/** Close the prompt: true after a reauthentication, false on Cancel. */
	settle(ok: boolean): void {
		const resolve = this.#resolve;
		this.request = null;
		this.password = '';
		this.code = '';
		this.#pending = null;
		this.#resolve = null;
		resolve?.(ok);
	}
}

export const reauthPrompt = new ReauthPromptStore();

// A prompt for an account that is no longer signed in here has nothing left to confirm.
session.onLeaveSignedIn(() => {
	if (reauthPrompt.request) reauthPrompt.settle(false);
});

/**
 * Ask the player to confirm it is them. Resolves true after they did, false when they cancelled.
 * `codeTypes` are the kinds of code the code step takes (both by default, as allauth's do).
 * A code is not offered to an account known to have no two-factor, unless it is the only way.
 */
export function requestReauth(
	methods: ReauthMethod[],
	codeTypes: ReauthCodeType[] = ['totp', 'recovery_codes']
): Promise<boolean> {
	const usable =
		session.mfaEnrolled === false ? methods.filter((method) => method !== 'code') : methods;
	return reauthPrompt.open(usable.length > 0 ? usable : methods, codeTypes);
}

/**
 * Run `call`. When the backend asks for a reauthentication, ask the player, then run `call` once
 * more. A second refusal becomes an `AppError` that says the confirmation did not work. On Cancel
 * it throws `ReauthCancelled`.
 */
export async function withReauth<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (error) {
		const methods = isAppError(error) ? reauthFlowsOf(error) : null;
		if (!methods) throw error;
		if (!(await requestReauth(methods, reauthCodeTypesOf(error as AppError)))) {
			throw new ReauthCancelled();
		}
	}
	try {
		return await call();
	} catch (error) {
		// Refused again right after the player confirmed: say so, not "You're not signed in".
		if (isAppError(error) && reauthFlowsOf(error)) {
			throw new AppError({
				kind: 'forbidden',
				status: error.status,
				code: 'reauthentication_failed',
				message: REAUTH_FAILED,
				fields: {},
				cause: error
			});
		}
		throw error;
	}
}

/** A refusal right after a reauthentication. */
const REAUTH_FAILED = "We couldn't confirm it's you. Try again.";
