/**
 * Deleting the account (plan `delete-account`, criteria 4 to 6): the service against the mocks,
 * and how the device ends the account once the backend answers 204.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAppError, reauthFlowsOf, type AppError } from '#lib/api/index.js';
import {
	MFA_REQUIRED_EMAIL,
	MOCK_PASSWORD,
	MOCK_TOTP_CODE,
	STAFF_EMAIL,
	VERIFIED_EMAIL
} from '#lib/mocks/fixtures.js';
import { cookieJarApi, useMockApi } from '#lib/mocks/node.js';
import { DELETE_ACCOUNT_ATTEMPTS, mockStore } from '#lib/mocks/store.js';
import { reauthPrompt, withReauth } from './reauth.svelte';
import { session } from './session.svelte';
import {
	authenticateMfa,
	deleteAccount,
	endDeletedAccount,
	login,
	logout,
	onSignOut,
	reauthenticate,
	reauthenticateMfa,
	resetBootstrap,
	setUnsentMatchesSource,
	unsentMatches,
	watchSessionExpiry
} from './services';

useMockApi();

let api: ReturnType<typeof cookieJarApi>;

beforeEach(() => {
	api = cookieJarApi();
	resetBootstrap();
	session.reset();
});

afterEach(() => {
	reauthPrompt.settle(false);
	session.reset();
});

/** The error a promise rejects with. */
async function failure(promise: Promise<unknown>): Promise<AppError> {
	try {
		await promise;
	} catch (cause) {
		if (isAppError(cause)) return cause;
		throw cause;
	}
	throw new Error('expected the call to fail');
}

const signIn = (email: string) => login({ email, password: MOCK_PASSWORD }, { api });

describe('deleteAccount', () => {
	it('deletes the account after a reauthentication and ends it on this device', async () => {
		await signIn(VERIFIED_EMAIL);
		await reauthenticate(MOCK_PASSWORD, { api });
		await deleteAccount({ api });
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)).toBeUndefined();
		expect(session.status).toBe('signed_out');
		expect(session.accountDeleted).toBe('deleted');
		expect(session.expired).toBe(false);
	});

	it('asks for a reauthentication first, and leaves the account signed in', async () => {
		await signIn(VERIFIED_EMAIL);
		const error = await failure(deleteAccount({ api }));
		expect(error.status).toBe(403);
		expect(error.code).toBe('reauthentication_required');
		expect(reauthFlowsOf(error)).toEqual(['password', 'code']);
		expect(session.isSignedIn).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});

	it('sends the delete again through withReauth once the player confirms', async () => {
		await signIn(VERIFIED_EMAIL);
		const done = withReauth(() => deleteAccount({ api }));
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		await reauthenticate(MOCK_PASSWORD, { api });
		reauthPrompt.settle(true);
		await done;
		expect(mockStore.accountByEmail(VERIFIED_EMAIL)).toBeUndefined();
		expect(session.accountDeleted).toBe('deleted');
	});

	it('is refused with mfa_required for an account that must set up two-factor', async () => {
		await signIn(MFA_REQUIRED_EMAIL);
		const error = await failure(deleteAccount({ api }));
		expect(error.status).toBe(403);
		expect(error.code).toBe('mfa_required');
		expect(session.isSignedIn).toBe(true);
	});

	it('is refused with a 409 conflict for a staff account', async () => {
		await signIn(STAFF_EMAIL);
		await authenticateMfa(MOCK_TOTP_CODE, { api });
		await reauthenticateMfa(MOCK_TOTP_CODE, { api });
		const error = await failure(deleteAccount({ api }));
		expect(error.status).toBe(409);
		expect(error.code).toBe('conflict');
		expect(mockStore.accountByEmail(STAFF_EMAIL)).toBeDefined();
		expect(session.isSignedIn).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});

	it('is throttled past the attempt limit', async () => {
		await signIn(VERIFIED_EMAIL);
		for (let i = 0; i < DELETE_ACCOUNT_ATTEMPTS; i += 1) await failure(deleteAccount({ api }));
		await reauthenticate(MOCK_PASSWORD, { api });
		const error = await failure(deleteAccount({ api }));
		expect(error.kind).toBe('throttled');
		expect(session.isSignedIn).toBe(true);
	});

	it('has ended the account before any code that waits on it runs', async () => {
		await signIn(VERIFIED_EMAIL);
		await reauthenticate(MOCK_PASSWORD, { api });
		const deleting = deleteAccount({ api });
		let seen: { signedIn: boolean; deleted: string | null } | null = null;
		// Registered before the caller's own await, so it runs first: as another 401 callback would.
		void deleting.then(() => {
			seen = { signedIn: session.isSignedIn, deleted: session.accountDeleted };
		});
		await deleting;
		expect(seen).toEqual({ signedIn: false, deleted: 'deleted' });
	});

	it('does not mark the session expired on a later 401', async () => {
		await signIn(VERIFIED_EMAIL);
		await reauthenticate(MOCK_PASSWORD, { api });
		const onExpired = vi.fn();
		const stop = watchSessionExpiry(onExpired, { api });
		await deleteAccount({ api });
		const later = await api.open.GET('/api/v1/accounts/me');
		stop();
		expect(later.response.status).toBe(401);
		expect(session.expired).toBe(false);
		expect(session.accountDeleted).toBe('deleted');
		expect(onExpired).not.toHaveBeenCalled();
	});
});

describe('endDeletedAccount', () => {
	it('runs the sign-out listeners with the email while still signed in, then signs out', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		const heard: [string | null, boolean][] = [];
		const stop = onSignOut((email) => heard.push([email, session.isSignedIn]));
		endDeletedAccount();
		stop();
		expect(heard).toEqual([[VERIFIED_EMAIL, true]]);
		expect(session.status).toBe('signed_out');
		expect(session.email).toBeNull();
		expect(session.accountDeleted).toBe('deleted');
		expect(session.expired).toBe(false);
	});

	it('still ends the account when a listener throws', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		const stop = onSignOut(() => {
			throw new Error('storage is blocked');
		});
		endDeletedAccount();
		stop();
		expect(session.status).toBe('signed_out');
		expect(session.accountDeleted).toBe('deleted');
	});

	it('leaves sign out as it was: listeners run and nothing says the account was deleted', async () => {
		await signIn(VERIFIED_EMAIL);
		let calls = 0;
		const stop = onSignOut(() => calls++);
		await logout({ api });
		stop();
		expect(calls).toBe(1);
		expect(session.accountDeleted).toBeNull();
	});
});

describe('session.accountDeleted', () => {
	it('is cleared by the next apply, such as a sign-in', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		session.markDeleted();
		expect(session.accountDeleted).toBe('deleted');
		session.apply({ status: 'signed_in', email: 'another@example.com' });
		expect(session.accountDeleted).toBeNull();
	});

	it('is cleared by reset', () => {
		session.markDeleted();
		session.reset();
		expect(session.accountDeleted).toBeNull();
	});

	it('is not set by an expiry', () => {
		session.apply({ status: 'signed_in', email: VERIFIED_EMAIL });
		session.expire();
		expect(session.expired).toBe(true);
		expect(session.accountDeleted).toBeNull();
	});
});

describe('unsentMatches', () => {
	it('is 0 when no source is set', () => {
		expect(unsentMatches()).toBe(0);
	});

	it('returns the source count, and 0 again once the source is removed', () => {
		const stop = setUnsentMatchesSource(() => 3);
		expect(unsentMatches()).toBe(3);
		stop();
		expect(unsentMatches()).toBe(0);
	});

	it('is 0 when the source throws', () => {
		const stop = setUnsentMatchesSource(() => {
			throw new Error('storage is blocked');
		});
		expect(unsentMatches()).toBe(0);
		stop();
	});

	it('keeps a newer source when an older one is removed', () => {
		const stopOld = setUnsentMatchesSource(() => 1);
		const stopNew = setUnsentMatchesSource(() => 2);
		stopOld();
		expect(unsentMatches()).toBe(2);
		stopNew();
	});
});
