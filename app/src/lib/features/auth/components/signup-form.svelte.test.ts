import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { session } from '../session.svelte.js';
import { signup } from '../services.js';
import SignupForm from './signup-form.svelte';

vi.mock('../services.js', () => ({ signup: vi.fn() }));
const mockedSignup = vi.mocked(signup);

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

beforeEach(() => {
	session.apply({ status: 'signed_out' });
});

afterEach(() => {
	mockedSignup.mockReset();
	session.reset();
});

async function fill(screen: Awaited<ReturnType<typeof render>>, email: string, password: string) {
	await screen.getByLabelText('Email').fill(email);
	await screen.getByLabelText('Password', { exact: true }).fill(password);
}

describe('SignupForm', () => {
	it('checks the email and the password length on the client', async () => {
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'nope', 'short');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		await expect.element(screen.getByText('Use at least 8 characters.')).toBeVisible();
		const password = screen.getByLabelText('Password', { exact: true });
		await expect.element(password).toHaveAttribute('aria-invalid', 'true');
		// The hint stays tied to the field next to the error.
		await expect
			.element(password)
			.toHaveAttribute('aria-describedby', 'signup-password-hint signup-password-error');
		expect(mockedSignup).not.toHaveBeenCalled();
	});

	it('shows check your email after a sign-up, with the address', async () => {
		mockedSignup.mockImplementation(async ({ email }) => {
			session.apply({ status: 'pending_verification' }, email);
			return { status: 'pending_verification' };
		});
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'Tamsin.Vale@Example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Check your email' }))
			.toBeVisible();
		await expect.element(screen.getByText('tamsin.vale@example.com')).toBeVisible();
		await expect.poll(() => document.title).toBe('Check your email · OPEN Pickleball');
		expect(mockedSignup).toHaveBeenCalledWith({
			email: 'tamsin.vale@example.com',
			password: 'a-long-enough-pass'
		});
	});

	it('offers signing in again for a new link, not a resend button', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });

		await expect.element(screen.getByText(/Sign in again with the same email/)).toBeVisible();
		await expect
			.element(screen.getByRole('button', { name: /resend|send it again/i }))
			.not.toBeInTheDocument();
	});

	it('links to sign in without clearing the pending state', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await expect
			.element(screen.getByRole('link', { name: 'Go to sign in' }))
			.toHaveAttribute('href', '/account/login');
		expect(session.status).toBe('pending_verification');
	});

	it('goes back to the form from "Start over"', async () => {
		session.apply({ status: 'pending_verification' }, 'tamsin.vale@example.com');
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await screen.getByRole('button', { name: 'Start over' }).click();
		await expect
			.element(screen.getByRole('heading', { level: 1, name: 'Create account' }))
			.toBeVisible();
	});

	it('shows the pending state while it waits', async () => {
		let finish: () => void = () => {};
		mockedSignup.mockReturnValue(
			new Promise((resolve) => (finish = () => resolve({ status: 'pending_verification' })))
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		const busy = screen.getByRole('button', { name: 'Creating account…' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish();
		await expect
			.element(screen.getByRole('button', { name: 'Create account' }))
			.not.toHaveAttribute('aria-disabled', 'true');
	});

	it('puts the backend password messages next to the password field', async () => {
		mockedSignup.mockRejectedValue(
			appError({ fields: { password: ['This password is too common.'] } })
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'password123');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByText('This password is too common.')).toBeVisible();
		await expect
			.element(screen.getByLabelText('Password', { exact: true }))
			.toHaveAttribute('aria-invalid', 'true');
	});

	it('shows the throttled message', async () => {
		mockedSignup.mockRejectedValue(
			appError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.'
			})
		);
		const screen = await render(SignupForm, { onsuccess: vi.fn() });
		await fill(screen, 'tamsin.vale@example.com', 'a-long-enough-pass');
		await screen.getByRole('button', { name: 'Create account' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText('Too many attempts. Wait a moment and try again.'))
			.toBeVisible();
	});
});
