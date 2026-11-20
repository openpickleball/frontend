import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError, type AppErrorFields } from '#lib/api/index.js';
import { session } from '../session.svelte.js';
import { login } from '../services.js';
import LoginForm from './login-form.svelte';

// The service has its own tests against the mock API. Here it is a stand-in.
vi.mock('../services.js', () => ({ login: vi.fn() }));
const mockedLogin = vi.mocked(login);

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
	mockedLogin.mockReset();
	session.reset();
});

async function fill(screen: Awaited<ReturnType<typeof render>>, email: string, password: string) {
	await screen.getByLabelText('Email').fill(email);
	await screen.getByLabelText('Password', { exact: true }).fill(password);
}

describe('LoginForm', () => {
	it('shows what is missing, inline and tied to the fields, without calling the backend', async () => {
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await screen.getByRole('button', { name: 'Sign in' }).click();

		const email = screen.getByLabelText('Email');
		await expect.element(email).toHaveAttribute('aria-invalid', 'true');
		await expect.element(email).toHaveAttribute('aria-describedby', 'login-email-error');
		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		await expect
			.element(screen.getByLabelText('Password', { exact: true }))
			.toHaveAttribute('aria-invalid', 'true');
		expect(mockedLogin).not.toHaveBeenCalled();
	});

	it('checks the email format before it asks the backend', async () => {
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'not-an-email', 'whatever');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByText('Enter a valid email address.')).toBeVisible();
		expect(mockedLogin).not.toHaveBeenCalled();
	});

	it('sends the email in canonical form and calls onsuccess when signed in', async () => {
		mockedLogin.mockResolvedValue({ status: 'signed_in', email: 'player@example.com' });
		const onsuccess = vi.fn();
		const screen = await render(LoginForm, { onsuccess });
		await fill(screen, '  Player@Example.com ', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalledOnce());
		expect(mockedLogin).toHaveBeenCalledWith({
			email: 'player@example.com',
			password: 'a-password'
		});
	});

	it('shows a pending state and blocks a second submit while it waits', async () => {
		let finish: (value: { status: 'signed_in'; email: string }) => void = () => {};
		mockedLogin.mockReturnValue(new Promise((resolve) => (finish = resolve)));
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		const busy = screen.getByRole('button', { name: 'Signing in…' });
		await expect.element(busy).toHaveAttribute('aria-disabled', 'true');
		await expect.element(busy).toHaveAttribute('aria-busy', 'true');
		finish({ status: 'signed_in', email: 'player@example.com' });
		await expect
			.element(screen.getByRole('button', { name: 'Sign in' }))
			.not.toHaveAttribute('aria-disabled', 'true');
		expect(mockedLogin).toHaveBeenCalledOnce();
	});

	it('keeps focus on the Sign in button after a failed sign-in', async () => {
		mockedLogin.mockRejectedValue(appError({ code: 'email_password_mismatch' }));
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'wrong-password');
		const button = screen.getByRole('button', { name: 'Sign in' });
		(button.element() as HTMLButtonElement).focus();
		await button.click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Sign in' }).element());
	});

	it('says the email and password do not match', async () => {
		mockedLogin.mockRejectedValue(
			appError({ code: 'email_password_mismatch', fields: { password: ['Wrong.'] } })
		);
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'wrong-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect.element(screen.getByText("That email and password don't match.")).toBeVisible();
		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText('Check both and try again, or reset your password.'))
			.toBeVisible();
	});

	it('puts the failure banner below the button, so the form does not move', async () => {
		mockedLogin.mockRejectedValue(appError({ code: 'email_password_mismatch' }));
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'wrong-password');
		const button = screen.getByRole('button', { name: 'Sign in' });
		const before = button.element().getBoundingClientRect().top;
		await button.click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		expect(button.element().getBoundingClientRect().top).toBe(before);
		const after = screen.getByRole('alert').element().getBoundingClientRect().top;
		expect(after).toBeGreaterThan(before);
	});

	it('shows the throttled message from the backend', async () => {
		mockedLogin.mockRejectedValue(
			appError({
				kind: 'throttled',
				status: 429,
				code: 'throttled',
				message: 'Too many attempts. Wait a moment and try again.'
			})
		);
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText('Too many attempts. Wait a moment and try again.'))
			.toBeVisible();
	});

	it('shows a server problem with a field next to that field', async () => {
		mockedLogin.mockRejectedValue(
			appError({ fields: { email: ['Enter a valid email address.'] } })
		);
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
	});

	it('shows a network failure in a banner', async () => {
		mockedLogin.mockRejectedValue(
			appError({
				kind: 'network',
				status: null,
				code: 'network_error',
				message: "We can't reach the server. Check your connection and try again."
			})
		);
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect
			.element(screen.getByText("We can't reach the server. Check your connection and try again."))
			.toBeVisible();
		await expect.element(screen.getByText("We couldn't sign you in.")).toBeVisible();
	});

	it('does not point at highlighted fields when the error marks none', async () => {
		mockedLogin.mockRejectedValue(
			appError({ message: "Something you entered wasn't accepted. Check it and try again." })
		);
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await fill(screen, 'player@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByText("We couldn't sign you in.")).toBeVisible();
		await expect.element(screen.getByText(/highlighted/)).not.toBeInTheDocument();
		await expect
			.element(screen.getByLabelText('Email'))
			.not.toHaveAttribute('aria-invalid', 'true');
	});

	it('shows a check your email notice above the form when the account needs verifying', async () => {
		mockedLogin.mockImplementation(async ({ email }) => {
			session.apply({ status: 'pending_verification' }, email);
			return { status: 'pending_verification' };
		});
		const onsuccess = vi.fn();
		const screen = await render(LoginForm, { onsuccess });
		await fill(screen, 'unverified@example.com', 'a-password');
		await screen.getByRole('button', { name: 'Sign in' }).click();

		await expect.element(screen.getByText('Check your email')).toBeVisible();
		await expect.element(screen.getByText('unverified@example.com')).toBeVisible();
		await expect.element(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toBeVisible();
		expect(onsuccess).not.toHaveBeenCalled();
	});

	it('keeps the sign-in form when the session is already pending', async () => {
		session.apply({ status: 'pending_verification' });
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeVisible();
		await expect.element(screen.getByLabelText('Email')).toBeVisible();
		await expect.element(screen.getByLabelText('Password', { exact: true })).toBeVisible();
		await expect.element(screen.getByText('Check your email')).toBeVisible();
	});

	it('shows the Show and Hide toggle for the password', async () => {
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		const password = screen.getByLabelText('Password', { exact: true });
		await expect.element(password).toHaveAttribute('type', 'password');
		const toggle = screen.getByRole('button', { name: 'Show password' });
		// The name changes with the state, so the button is not also a pressed toggle.
		await expect.element(toggle).not.toHaveAttribute('aria-pressed');
		await toggle.click();
		await expect.element(password).toHaveAttribute('type', 'text');
		await expect.element(screen.getByRole('button', { name: 'Hide password' })).toBeVisible();
	});

	it('says why the player is back on sign in after the session ended', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		session.expire();
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByText('You were signed out.')).toBeVisible();
		await expect
			.element(screen.getByText('Your session ended. Sign in again to continue.'))
			.toBeVisible();
	});

	it('says nothing about a session on a plain visit', async () => {
		const screen = await render(LoginForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByRole('heading', { name: 'Sign in' })).toBeVisible();
		await expect.element(screen.getByText('You were signed out.')).not.toBeInTheDocument();
	});
});
