import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import type { AppError } from '#lib/api/index.js';
import { verifyEmail } from '../services.js';
import VerifyEmail from './verify-email.svelte';

vi.mock('../services.js', () => ({ verifyEmail: vi.fn() }));
const mockedVerify = vi.mocked(verifyEmail);

function appError(overrides: Partial<AppError>): AppError {
	return {
		kind: 'validation',
		status: 400,
		code: 'error',
		message: 'Something went wrong.',
		fields: {},
		...overrides
	};
}

afterEach(() => mockedVerify.mockReset());

describe('VerifyEmail', () => {
	it('confirms the key when the page opens, and moves focus to the result', async () => {
		mockedVerify.mockResolvedValue(undefined);
		const screen = await render(VerifyEmail, { key: 'k1' });

		const heading = screen.getByRole('heading', { name: 'Email confirmed' });
		await expect.element(heading).toHaveFocus();
		await expect.element(screen.getByRole('status')).toBeVisible();
		await expect.element(screen.getByText('Your email is confirmed.')).toBeVisible();
		await expect.element(screen.getByRole('link', { name: 'Sign in' })).toBeVisible();
		expect(mockedVerify).toHaveBeenCalledExactlyOnceWith('k1');
	});

	it('says so while it works', async () => {
		mockedVerify.mockReturnValue(new Promise(() => {}));
		const screen = await render(VerifyEmail, { key: 'k1' });
		await expect.element(screen.getByText('Confirming your email...')).toBeVisible();
	});

	it.each([400, 404, 410])('treats a %i as a link that does not work', async (status) => {
		mockedVerify.mockRejectedValue(appError({ status }));
		const screen = await render(VerifyEmail, { key: 'k1' });
		await expect
			.element(screen.getByRole('heading', { name: "This link doesn't work anymore" }))
			.toBeVisible();
		await expect.element(screen.getByRole('alert')).not.toBeInTheDocument();
	});

	it('shows the failure and can try again when it was not the key', async () => {
		mockedVerify.mockRejectedValueOnce(
			appError({ kind: 'network', status: null, code: 'network', message: 'No connection.' })
		);
		mockedVerify.mockResolvedValueOnce(undefined);
		const screen = await render(VerifyEmail, { key: 'k1' });

		await expect.element(screen.getByRole('alert')).toHaveTextContent('No connection.');
		await screen.getByRole('button', { name: 'Try again' }).click();
		await expect.element(screen.getByRole('heading', { name: 'Email confirmed' })).toBeVisible();
		expect(mockedVerify).toHaveBeenCalledTimes(2);
	});
});
