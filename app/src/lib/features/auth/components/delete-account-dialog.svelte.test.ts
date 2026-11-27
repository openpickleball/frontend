import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page, userEvent } from 'vitest/browser';
import { goto } from '$app/navigation';
import { AppError, toAppError } from '#lib/api/index.js';
import { reauthPrompt } from '../reauth.svelte.js';
import * as services from '../services.js';
import { session } from '../session.svelte.js';
import DeleteAccountDialog from './delete-account-dialog.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('../services.js')>()),
	deleteAccount: vi.fn(),
	checkMfaEnrolled: vi.fn(async () => false),
	endDeletedAccount: vi.fn(),
	unsentMatches: vi.fn(() => 0)
}));
vi.mock('$app/navigation', () => ({ goto: vi.fn(async () => {}) }));
const mocked = vi.mocked(services);

const GOES =
	'Your email address, password, names, birth month and year, gender division, city and region, privacy settings, sign-in sessions, two-factor methods and organizer memberships.';
const STAYS =
	'If you played matches, they stay, so other players\' ratings don\'t change. In those matches you show as "Private player", and your player keeps its OPEN Code.';
const AGAIN =
	'You can sign up again later with the same email address, as a new player who starts fresh.';
const ONE_UNSENT =
	"1 match hasn't been sent yet. It's only on this device, and deleting your account deletes it.";
const THREE_UNSENT =
	"3 matches haven't been sent yet. They're only on this device, and deleting your account deletes them.";
const MFA = 'Your account needs two-factor sign-in before it can be deleted.';
const STAFF =
	"A staff account can't be deleted here. Email info@openpb.org and we will delete it for you.";
const THROTTLED = 'Too many attempts. Wait a moment and try again.';

const openError = (status: number, code: string, message = 'x') =>
	toAppError({ code, message, errors: [] }, new Response(null, { status }));

function deferred() {
	let resolve!: () => void;
	const promise = new Promise<'deleted'>((yes) => (resolve = () => yes('deleted')));
	return { promise, resolve };
}

const dialog = () => page.getByRole('alertdialog', { name: 'Delete your account?' });
const deleteButton = () => dialog().getByRole('button', { name: 'Delete account' });
const word = () => dialog().getByLabelText('Type delete to confirm');

async function openAndConfirm() {
	await render(DeleteAccountDialog, { open: true });
	await word().fill('delete');
	await deleteButton().click();
}

beforeEach(() => {
	session.apply({ status: 'signed_in', email: 'player@example.com' });
	mocked.unsentMatches.mockReturnValue(0);
});

afterEach(() => {
	vi.mocked(goto).mockClear();
	mocked.deleteAccount.mockReset();
	mocked.endDeletedAccount.mockReset();
	reauthPrompt.settle(false);
	session.reset();
});

describe('DeleteAccountDialog: what it says', () => {
	it('says what goes, what stays, that it is final, and how to come back', async () => {
		await render(DeleteAccountDialog, { open: true });
		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog().getByText("This can't be undone.")).toBeVisible();
		await expect.element(dialog().getByText('What goes')).toBeVisible();
		await expect.element(dialog().getByText(GOES)).toBeVisible();
		await expect.element(dialog().getByText('What stays')).toBeVisible();
		await expect.element(dialog().getByText(STAYS)).toBeVisible();
		await expect.element(dialog().getByText(AGAIN)).toBeVisible();
	});

	it('warns about 1 unsent match', async () => {
		mocked.unsentMatches.mockReturnValue(1);
		await render(DeleteAccountDialog, { open: true });
		await expect.element(dialog().getByText(ONE_UNSENT)).toBeVisible();
	});

	it('warns about 3 unsent matches', async () => {
		mocked.unsentMatches.mockReturnValue(3);
		await render(DeleteAccountDialog, { open: true });
		await expect.element(dialog().getByText(THREE_UNSENT)).toBeVisible();
	});

	it('does not warn when nothing is unsent', async () => {
		await render(DeleteAccountDialog, { open: true });
		await expect.element(dialog()).toBeVisible();
		await expect.element(page.getByText(/been sent yet/)).not.toBeInTheDocument();
	});

	it('reads the unsent count each time it opens', async () => {
		const screen = await render(DeleteAccountDialog, { open: true });
		await expect.element(dialog()).toBeVisible();
		await screen.rerender({ open: false });
		mocked.unsentMatches.mockReturnValue(1);
		await screen.rerender({ open: true });
		await expect.element(dialog().getByText(ONE_UNSENT)).toBeVisible();
	});
});

describe('DeleteAccountDialog: the trigger', () => {
	it('opens from the default button', async () => {
		await render(DeleteAccountDialog);
		await page.getByRole('button', { name: 'Delete your account' }).click();
		await expect.element(dialog()).toBeVisible();
	});

	it('opens from a trigger snippet that spreads its props', async () => {
		const trigger = createRawSnippet<[{ props: Record<string, unknown> }]>((args) => ({
			render: () => '<button type="button">My row</button>',
			setup: (element) => {
				for (const [key, value] of Object.entries(args().props)) {
					if (typeof value === 'function' && key.startsWith('on')) {
						element.addEventListener(key.slice(2), value as EventListener);
					} else if (value !== undefined && value !== null && typeof value !== 'object') {
						element.setAttribute(key, String(value));
					}
				}
			}
		}));
		await render(DeleteAccountDialog, { trigger });
		await page.getByRole('button', { name: 'My row' }).click();
		await expect.element(dialog()).toBeVisible();
	});
});

describe('DeleteAccountDialog: the typed word', () => {
	it('keeps the button disabled until the word is delete', async () => {
		await render(DeleteAccountDialog, { open: true });
		const field = word();
		await expect.element(field).toHaveAttribute('autocomplete', 'off');
		await expect.element(field).toHaveAttribute('autocapitalize', 'off');
		await expect.element(field).toHaveAttribute('spellcheck', 'false');
		await expect.element(deleteButton()).toBeDisabled();
		for (const typed of ['delet', 'deletee']) {
			await field.fill(typed);
			await expect.element(deleteButton()).toBeDisabled();
		}
		await field.fill(' DELETE ');
		await expect.element(deleteButton()).toBeEnabled();
	});

	it('starts empty again each time it opens', async () => {
		const screen = await render(DeleteAccountDialog, { open: true });
		await word().fill('delete');
		await screen.rerender({ open: false });
		await screen.rerender({ open: true });
		await expect.element(word()).toHaveValue('');
		await expect.element(deleteButton()).toBeDisabled();
	});
});

describe('DeleteAccountDialog: confirming', () => {
	it('deletes and goes to sign in, leaving the end of the account to the service', async () => {
		mocked.deleteAccount.mockResolvedValue('deleted');
		await openAndConfirm();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/account/login'));
		expect(mocked.deleteAccount).toHaveBeenCalledTimes(1);
		expect(mocked.endDeletedAccount).not.toHaveBeenCalled();
	});

	it("asks the player to confirm it's them, then deletes again", async () => {
		mocked.deleteAccount
			.mockRejectedValueOnce(openError(403, 'reauthentication_required'))
			.mockResolvedValueOnce('deleted');
		await openAndConfirm();
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		expect(goto).not.toHaveBeenCalled();
		reauthPrompt.settle(true);
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/account/login'));
		expect(mocked.deleteAccount).toHaveBeenCalledTimes(2);
		expect(mocked.endDeletedAccount).not.toHaveBeenCalled();
	});

	it('stays open with no error when the player cancels the prompt', async () => {
		mocked.deleteAccount.mockRejectedValueOnce(openError(403, 'reauthentication_required'));
		await openAndConfirm();
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		reauthPrompt.settle(false);
		await expect.element(deleteButton()).not.toHaveAttribute('aria-busy', 'true');
		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog().getByRole('alert')).not.toBeInTheDocument();
		expect(goto).not.toHaveBeenCalled();
		expect(mocked.deleteAccount).toHaveBeenCalledTimes(1);
	});

	it('links to two-factor authentication when the account needs it', async () => {
		mocked.deleteAccount.mockRejectedValue(openError(403, 'mfa_required'));
		await openAndConfirm();
		const alert = dialog().getByRole('alert');
		await expect.element(alert.getByText(MFA)).toBeVisible();
		await expect
			.element(alert.getByRole('link', { name: 'Go to two-factor authentication' }))
			.toHaveAttribute('href', '/profile/two-factor');
		expect(goto).not.toHaveBeenCalled();
	});

	it('says a staff account is deleted by email', async () => {
		mocked.deleteAccount.mockRejectedValue(
			openError(409, 'conflict', 'A staff account cannot be deleted here.')
		);
		await openAndConfirm();
		const alert = dialog().getByRole('alert');
		await expect.element(alert).toHaveTextContent(STAFF);
		await expect
			.element(alert.getByRole('link', { name: 'info@openpb.org' }))
			.toHaveAttribute('href', 'mailto:info@openpb.org');
	});

	it('shows the shared throttled message', async () => {
		mocked.deleteAccount.mockRejectedValue(openError(429, 'throttled'));
		await openAndConfirm();
		await expect.element(dialog().getByRole('alert')).toHaveTextContent(THROTTLED);
	});

	it("shows any other error's message", async () => {
		mocked.deleteAccount.mockRejectedValue(
			new AppError({
				kind: 'network',
				status: null,
				code: 'network',
				message: 'Made-up network trouble.',
				fields: {}
			})
		);
		await openAndConfirm();
		await expect.element(dialog().getByRole('alert')).toHaveTextContent('Made-up network trouble.');
	});

	it('clears the error each time it opens', async () => {
		mocked.deleteAccount.mockRejectedValue(openError(429, 'throttled'));
		const screen = await render(DeleteAccountDialog, { open: true });
		await word().fill('delete');
		await deleteButton().click();
		await expect.element(dialog().getByRole('alert')).toBeVisible();
		await screen.rerender({ open: false });
		await screen.rerender({ open: true });
		await expect.element(dialog()).toBeVisible();
		await expect.element(dialog().getByRole('alert')).not.toBeInTheDocument();
	});

	it('cannot be closed while the delete is in flight', async () => {
		const answer = deferred();
		mocked.deleteAccount.mockReturnValue(answer.promise);
		await openAndConfirm();
		await expect.element(deleteButton()).toHaveAttribute('aria-busy', 'true');
		await dialog().getByRole('button', { name: 'Cancel' }).click({ force: true });
		await userEvent.keyboard('{Escape}');
		await expect.element(dialog()).toBeVisible();
		await deleteButton().click({ force: true });
		expect(mocked.deleteAccount).toHaveBeenCalledTimes(1);
		answer.resolve();
		await vi.waitFor(() => expect(goto).toHaveBeenCalledWith('/account/login'));
	});
});
