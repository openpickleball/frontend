import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { verifyEmail } from '../services.js';
import VerifyEmail from './verify-email.svelte';

vi.mock('../services.js', () => ({ verifyEmail: vi.fn() }));
const mockedVerify = vi.mocked(verifyEmail);

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

afterEach(() => mockedVerify.mockReset());

describe('VerifyEmail', () => {
	it('confirms the key when the page opens, and moves focus to the result', async () => {
		mockedVerify.mockResolvedValue(undefined);
		const screen = await render(VerifyEmail, { key: 'k1' });

		const heading = screen.getByRole('heading', { name: 'Email verified' });
		await expect.element(heading).toHaveFocus();
		await expect.element(screen.getByText('Sign in to record your first match.')).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
		await expect.poll(() => document.title).toBe('Email verified · OPEN Pickleball');
		expect(mockedVerify).toHaveBeenCalledExactlyOnceWith('k1');
	});

	it('says so while it works', async () => {
		mockedVerify.mockReturnValue(new Promise(() => {}));
		const screen = await render(VerifyEmail, { key: 'k1' });
		await expect.element(screen.getByText('Verifying your email…')).toBeVisible();
	});

	it.each([400, 404, 410])('treats a %i as a link that does not work', async (status) => {
		mockedVerify.mockRejectedValue(appError({ status }));
		const screen = await render(VerifyEmail, { key: 'k1' });
		await expect
			.element(screen.getByRole('heading', { name: "This link doesn't work anymore" }))
			.toBeVisible();
		await expect
			.poll(() => document.title)
			.toBe("This link doesn't work anymore · OPEN Pickleball");
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows the failure and can try again when it was not the key', async () => {
		mockedVerify.mockRejectedValueOnce(
			appError({ kind: 'network', status: null, code: 'network', message: 'No connection.' })
		);
		mockedVerify.mockResolvedValueOnce(undefined);
		const screen = await render(VerifyEmail, { key: 'k1' });

		await expect.element(screen.getByRole('alert')).toHaveTextContent('No connection.');
		await expect.poll(() => document.title).toBe("We couldn't verify your email · OPEN Pickleball");
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByRole('heading', { name: 'Email verified' })).toBeVisible();
		expect(mockedVerify).toHaveBeenCalledTimes(2);
	});
});
