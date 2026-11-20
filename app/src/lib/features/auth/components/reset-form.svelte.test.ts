import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { checkResetKey, resetPassword } from '../services.js';
import ResetForm from './reset-form.svelte';

vi.mock('../services.js', () => ({ checkResetKey: vi.fn(), resetPassword: vi.fn() }));
const mockedCheck = vi.mocked(checkResetKey);
const mockedReset = vi.mocked(resetPassword);

const KEY = 'abc-123';

function appError(overrides: Partial<AppErrorFields>): AppError {
	return new AppError({
		kind: 'validation',
		status: 400,
		code: 'error',
		message: 'Something went wrong.',
		fields: {},
		...overrides
	});
}

afterEach(() => {
	mockedCheck.mockReset();
	mockedReset.mockReset();
});

describe('ResetForm', () => {
	it('checks the link first, then shows the form', async () => {
		mockedCheck.mockResolvedValue(true);
		const screen = await render(ResetForm, { key: KEY });
		await expect.element(screen.getByLabelText('New password')).toBeVisible();
		expect(mockedCheck).toHaveBeenCalledWith(KEY);
	});

	it('says the link does not work when the key is no longer good', async () => {
		mockedCheck.mockResolvedValue(false);
		const screen = await render(ResetForm, { key: KEY });
		await expect
			.element(screen.getByRole('heading', { name: "This link doesn't work anymore" }))
			.toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Send a new link' })).toBeVisible();
		await expect
			.poll(() => document.title)
			.toBe("This link doesn't work anymore · OPEN Pickleball");
	});

	it('shows the form when the link cannot be checked, and lets the submit report', async () => {
		mockedCheck.mockRejectedValue(new Error('offline'));
		const screen = await render(ResetForm, { key: KEY });
		await expect.element(screen.getByLabelText('New password')).toBeVisible();
	});

	it('checks the password length before it asks the backend', async () => {
		mockedCheck.mockResolvedValue(true);
		const screen = await render(ResetForm, { key: KEY });
		await screen.getByLabelText('New password', { exact: true }).fill('short');
		await screen.getByRole('button', { name: 'Save new password' }).click();

		await expect.element(screen.getByText('Use at least 8 characters.')).toBeVisible();
		await expect
			.element(screen.getByLabelText('New password', { exact: true }))
			.toHaveAttribute('aria-invalid', 'true');
		expect(mockedReset).not.toHaveBeenCalled();
	});

	it('confirms the change and points to sign in', async () => {
		mockedCheck.mockResolvedValue(true);
		mockedReset.mockResolvedValue(undefined);
		const screen = await render(ResetForm, { key: KEY });
		await screen.getByLabelText('New password', { exact: true }).fill('a-long-enough-pass');
		await screen.getByRole('button', { name: 'Save new password' }).click();

		const heading = screen.getByRole('heading', { name: 'Password changed' });
		await expect.element(heading).toHaveFocus();
		await expect.element(screen.getByText('Sign in with your new password.')).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect.poll(() => document.title).toBe('Password changed · OPEN Pickleball');
		expect(mockedReset).toHaveBeenCalledWith(KEY, 'a-long-enough-pass');
	});

	it('shows the link-does-not-work view when the backend rejects the key', async () => {
		mockedCheck.mockResolvedValue(true);
		mockedReset.mockRejectedValue(appError({ fields: { key: ['Invalid.'] } }));
		const screen = await render(ResetForm, { key: KEY });
		await screen.getByLabelText('New password', { exact: true }).fill('a-long-enough-pass');
		await screen.getByRole('button', { name: 'Save new password' }).click();

		await expect
			.element(screen.getByRole('heading', { name: "This link doesn't work anymore" }))
			.toBeVisible();
	});

	it('puts a backend password message next to the field', async () => {
		mockedCheck.mockResolvedValue(true);
		mockedReset.mockRejectedValue(
			appError({ fields: { password: ['This password is too common.'] } })
		);
		const screen = await render(ResetForm, { key: KEY });
		await screen.getByLabelText('New password', { exact: true }).fill('password123');
		await screen.getByRole('button', { name: 'Save new password' }).click();

		await expect.element(screen.getByText('This password is too common.')).toBeVisible();
	});

	it('shows any other failure above the form', async () => {
		mockedCheck.mockResolvedValue(true);
		mockedReset.mockRejectedValue(
			appError({ kind: 'network', status: null, code: 'network', message: 'No connection.' })
		);
		const screen = await render(ResetForm, { key: KEY });
		await screen.getByLabelText('New password', { exact: true }).fill('a-long-enough-pass');
		await screen.getByRole('button', { name: 'Save new password' }).click();

		await expect.element(screen.getByRole('alert')).toHaveTextContent('No connection.');
		await expect
			.element(screen.getByRole('button', { name: 'Save new password' }))
			.not.toHaveAttribute('aria-disabled', 'true');
	});
});
