import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { session } from '../session.svelte.js';
import { authenticateMfa, cancelMfa } from '../services.js';
import MfaCodeForm from './mfa-code-form.svelte';

// The services have their own tests against the mock API. Here they are stand-ins.
vi.mock('../services.js', () => ({ authenticateMfa: vi.fn(), cancelMfa: vi.fn() }));
const mockedAuthenticate = vi.mocked(authenticateMfa);
const mockedCancel = vi.mocked(cancelMfa);

const wrongCode = () =>
	new AppError({
		kind: 'validation',
		status: 400,
		code: 'incorrect_code',
		message: 'Incorrect code.',
		fields: { code: ['Incorrect code.'] }
	});

beforeEach(() => {
	session.apply({ status: 'pending_mfa', types: ['totp', 'recovery_codes'] });
});

afterEach(() => {
	mockedAuthenticate.mockReset();
	mockedCancel.mockReset();
	session.reset();
});

describe('MfaCodeForm', () => {
	it('asks for the 6-digit code from the app, with a numeric one-time-code field', async () => {
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await expect
			.element(screen.getByRole('heading', { level: 1 }))
			.toHaveTextContent('Enter your code');
		const field = screen.getByLabelText('Code from your app');
		await expect.element(field).toHaveAttribute('inputmode', 'numeric');
		await expect.element(field).toHaveAttribute('autocomplete', 'one-time-code');
		await expect.element(field).toHaveAttribute('maxlength', '6');
	});

	it('checks the code is 6 digits before it asks the backend', async () => {
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByLabelText('Code from your app').fill('12ab');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByText('Enter the 6-digit code from your app.')).toBeVisible();
		expect(mockedAuthenticate).not.toHaveBeenCalled();
	});

	it('sends the code and calls onsuccess once signed in', async () => {
		mockedAuthenticate.mockResolvedValue({ status: 'signed_in', email: 'twofactor@example.com' });
		const onsuccess = vi.fn();
		const screen = await render(MfaCodeForm, { onsuccess });
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await vi.waitFor(() => expect(onsuccess).toHaveBeenCalledOnce());
		expect(mockedAuthenticate).toHaveBeenCalledWith('123456');
	});

	it('shows a wrong code on the code field and stays on the code step', async () => {
		mockedAuthenticate.mockRejectedValue(wrongCode());
		const onsuccess = vi.fn();
		const screen = await render(MfaCodeForm, { onsuccess });
		await screen.getByLabelText('Code from your app').fill('000000');
		await screen.getByRole('button', { name: 'Continue' }).click();
		const field = screen.getByLabelText('Code from your app');
		await expect.element(field).toHaveAttribute('aria-invalid', 'true');
		await expect.element(screen.getByText('Incorrect code.')).toBeVisible();
		expect(onsuccess).not.toHaveBeenCalled();
	});

	it('switches to a recovery code and back', async () => {
		mockedAuthenticate.mockResolvedValue({ status: 'signed_in', email: 'twofactor@example.com' });
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByRole('button', { name: 'Use a recovery code' }).click();
		const field = screen.getByLabelText('Recovery code');
		await expect.element(field).toHaveAttribute('autocomplete', 'off');
		await expect.element(field).not.toHaveAttribute('maxlength');
		await field.fill('mock0001');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await vi.waitFor(() => expect(mockedAuthenticate).toHaveBeenCalledWith('mock0001'));
		await screen.getByRole('button', { name: 'Use your authenticator app' }).click();
		await expect.element(screen.getByLabelText('Code from your app')).toBeVisible();
	});

	it('offers no recovery code when the backend does not', async () => {
		session.apply({ status: 'pending_mfa', types: ['totp'] });
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await expect.element(screen.getByLabelText('Code from your app')).toBeVisible();
		expect(screen.getByRole('button', { name: 'Use a recovery code' }).query()).toBeNull();
	});

	it('starts over', async () => {
		mockedCancel.mockResolvedValue();
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByRole('button', { name: 'Start over' }).click();
		expect(mockedCancel).toHaveBeenCalledOnce();
	});

	it('shows a failure with no field in a banner below the button', async () => {
		mockedAuthenticate.mockRejectedValue(
			new AppError({
				kind: 'network',
				status: null,
				code: 'network_error',
				message: "We can't reach the server. Check your connection and try again.",
				fields: {}
			})
		);
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByRole('alert')).toBeVisible();
		await expect.element(screen.getByText("We couldn't check your code.")).toBeVisible();
	});
});
