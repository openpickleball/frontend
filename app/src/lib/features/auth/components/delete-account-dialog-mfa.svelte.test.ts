/**
 * The delete dialog's 403 `mfa_required` (plan `delete-account`, criterion 4). An account that
 * has two-factor only has to confirm with a code in this session; any other account needs to set
 * it up first. It decides as `watchMfaRequired` does: trust `session.mfaEnrolled` only when it
 * says on, and otherwise ask again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { toAppError } from '#lib/api/index.js';
import { reauthPrompt } from '../reauth.svelte.js';
import * as services from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	deleteAccount: vi.fn(),
	checkMfaEnrolled: vi.fn(),
	unsentMatches: vi.fn(() => 0)
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mocked = vi.mocked(services);

const CONFIRM = 'Confirm with a code from your authenticator app, then press Delete account again.';
const SET_UP = 'Your account needs two-factor sign-in before it can be deleted.';

const dialog = () => page.getByRole('alertdialog', { name: 'Delete your account?' });
const alert = () => dialog().getByRole('alert');

async function openAndConfirm() {
	await render(DeleteAccountDialog, { open: true });
	await dialog().getByLabelText('Type delete to confirm').fill('delete');
	await dialog().getByRole('button', { name: 'Delete account' }).click();
}

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	mocked.deleteAccount.mockRejectedValue(
		toAppError(
			{ code: 'mfa_required', message: 'x', errors: [] },
			new Response(null, { status: 403 })
		)
	);
});

afterEach(() => {
	mocked.deleteAccount.mockReset();
	mocked.checkMfaEnrolled.mockReset();
	reauthPrompt.settle(false);
	session.reset();
});

describe('DeleteAccountDialog: mfa_required for an account with two-factor', () => {
	it('offers the code prompt when the session says two-factor is on, without asking again', async () => {
		session.mfaEnrolled = true;
		await openAndConfirm();
		await expect.element(alert().getByText(CONFIRM)).toBeVisible();
		await expect.element(alert().getByText(SET_UP)).not.toBeInTheDocument();
		await expect
			.element(alert().getByRole('link', { name: 'Go to two-factor authentication' }))
			.not.toBeInTheDocument();
		await alert().getByRole('button', { name: 'Enter a code' }).click();
		await vi.waitFor(() => expect(reauthPrompt.request?.methods).toEqual(['code']));
		expect(mocked.checkMfaEnrolled).not.toHaveBeenCalled();
	});

	it('asks again when the session does not know, and offers the code prompt', async () => {
		mocked.checkMfaEnrolled.mockResolvedValue(true);
		await openAndConfirm();
		await expect.element(alert().getByText(CONFIRM)).toBeVisible();
		await expect.element(alert().getByRole('button', { name: 'Enter a code' })).toBeVisible();
		expect(mocked.checkMfaEnrolled).toHaveBeenCalledTimes(1);
	});
});

describe('DeleteAccountDialog: mfa_required for an account without two-factor', () => {
	it('asks again even when the session says off, then links to the setup', async () => {
		session.mfaEnrolled = false;
		mocked.checkMfaEnrolled.mockResolvedValue(false);
		await openAndConfirm();
		await expect.element(alert().getByText(SET_UP)).toBeVisible();
		await expect
			.element(alert().getByRole('link', { name: 'Go to two-factor authentication' }))
			.toHaveAttribute('href', '/profile/two-factor');
		await expect
			.element(alert().getByRole('button', { name: 'Enter a code' }))
			.not.toBeInTheDocument();
		expect(mocked.checkMfaEnrolled).toHaveBeenCalledTimes(1);
	});

	it('links to the setup when two-factor stays unknown', async () => {
		mocked.checkMfaEnrolled.mockResolvedValue(null);
		await openAndConfirm();
		await expect.element(alert().getByText(SET_UP)).toBeVisible();
		await expect.element(alert().getByText(CONFIRM)).not.toBeInTheDocument();
	});
});
