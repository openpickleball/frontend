/**
 * The session: who is signed in, if anyone. One store for the whole app, filled once
 * from `GET auth/session` (see `bootstrap()` in services.ts) and kept current by the
 * auth services.
 */
import type { OpenComponents } from '#lib/api/index.js';

/**
 * - `unknown`: the session has not been read yet. Only before the first load.
 * - `signed_out`: nobody is signed in.
 * - `pending_verification`: a sign-up or login is waiting for the player to open the
 *   link we emailed. They are not signed in yet.
 * - `pending_mfa`: a login passed the password and waits for a two-factor code. The player is
 *   not signed in yet: guarded pages send them to sign in, which shows the code step.
 * - `signed_in`: signed in, and `email` is the account's address.
 */
export type SessionStatus =
	'unknown' | 'signed_out' | 'pending_verification' | 'pending_mfa' | 'signed_in';

/** The kinds of code the two-factor step accepts: from the app, or a recovery code. */
export type MfaType = 'totp' | 'recovery_codes';

/** What the backend says the session is. `email` is only known when it is signed in. */
export type SessionState =
	| { status: 'signed_out' }
	| { status: 'pending_verification' }
	| { status: 'pending_mfa'; types: MfaType[] }
	| { status: 'signed_in'; email: string };

/** One of the signed-in account's own organizer memberships. */
export type OrganizerMembership = OpenComponents['schemas']['OrganizerMembershipOut'];

class Session {
	status = $state<SessionStatus>('unknown');
	/**
	 * Signed in: the account's address. Pending verification: the address the player
	 * just typed, when this page knows it (a page reload forgets it). Otherwise null.
	 */
	email = $state<string | null>(null);
	/** True when the session ended while the app was open, so sign-in can say why it is back. */
	expired = $state(false);
	/** With `pending_mfa`: the kinds of code the backend accepts. Empty otherwise. */
	mfaTypes = $state<MfaType[]>([]);
	/**
	 * Signed in: the account's organizer memberships, or null while unknown or loading. Display
	 * only: the backend decides what an organizer may do.
	 */
	organizers = $state<OrganizerMembership[] | null>(null);
	#mfaEnrolled = $state<boolean | null>(null);
	/** Counts the writes to `mfaEnrolled`, so a slow read can tell it was set after it started. */
	mfaRevision = 0;

	/** Signed in: whether two-factor (TOTP) is on, or null while unknown. */
	get mfaEnrolled(): boolean | null {
		return this.#mfaEnrolled;
	}

	set mfaEnrolled(value: boolean | null) {
		this.#mfaEnrolled = value;
		this.mfaRevision++;
	}

	get isSignedIn(): boolean {
		return this.status === 'signed_in';
	}

	/** A member of at least one organizer. False while unknown, loading or after a failure. */
	get isOrganizer(): boolean {
		return (this.organizers?.length ?? 0) > 0;
	}

	/** Take the backend's answer. `typedEmail` is kept while verification is pending. */
	apply(state: SessionState, typedEmail?: string): void {
		const sameAccount =
			this.status === 'signed_in' && state.status === 'signed_in' && this.email === state.email;
		this.status = state.status;
		this.expired = false;
		this.mfaTypes = state.status === 'pending_mfa' ? state.types : [];
		if (!sameAccount) {
			this.organizers = null;
			this.mfaEnrolled = null;
		}
		if (state.status === 'signed_in') this.email = state.email;
		else if (state.status === 'pending_verification') this.email = typedEmail ?? this.email;
		else this.email = null;
	}

	/** The backend refused a call because the session ended. This device is signed out now. */
	expire(): void {
		this.apply({ status: 'signed_out' });
		this.expired = true;
	}

	/** Forget a pending verification on this device, such as "Use a different email". */
	clearPending(): void {
		if (this.status === 'pending_verification') this.apply({ status: 'signed_out' });
	}

	/** Back to the start. For tests. */
	reset(): void {
		this.status = 'unknown';
		this.email = null;
		this.expired = false;
		this.mfaTypes = [];
		this.organizers = null;
		this.mfaEnrolled = null;
	}
}

export const session = new Session();
