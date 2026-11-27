import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { AppError } from '#lib/api/index.js';
import { reauthPrompt, requestReauth } from '../reauth.svelte.js';
import { reauthenticate, reauthenticateMfa } from '../services.js';
import { session } from '../session.svelte.js';
import ReauthPrompt from './reauth-prompt.svelte';

vi.mock('../services.js', () => ({ reauthenticate: vi.fn(), reauthenticateMfa: vi.fn() }));
const mockedPassword = vi.mocked(reauthenticate);
const mockedCode = vi.mocked(reauthenticateMfa);

afterEach(() => {
	reauthPrompt.settle(false);
	mockedPassword.mockReset();
	mockedCode.mockReset();
	session.reset();
});

function fieldError(field: string, message: string): AppError {
	return new AppError({
		kind: 'validation',
		status: 400,
		code: 'incorrect',
		message,
		fields: { [field]: [message] }
	});
}

describe('ReauthPrompt', () => {
	it('shows nothing until a call asks', async () => {
		const screen = await render(ReauthPrompt);
		expect(screen.getByRole('dialog').query()).toBeNull();
	});

	it('asks for the password, focused, and resolves true once it is right', async () => {
		mockedPassword.mockResolvedValue();
		const screen = await render(ReauthPrompt);
		const asked = requestReauth(['password']);
		const field = screen.getByLabelText('Password', { exact: true });
		await expect.element(field).toHaveFocus();
		await field.fill('a-password');
		await screen.getByRole('button', { name: 'Confirm' }).click();
		expect(await asked).toBe(true);
		expect(mockedPassword).toHaveBeenCalledWith('a-password');
		await expect.element(screen.getByRole('dialog')).not.toBeInTheDocument();
	});

	it('shows a wrong password on the field and stays open', async () => {
		mockedPassword.mockRejectedValue(fieldError('password', 'Incorrect password.'));
		const screen = await render(ReauthPrompt);
		void requestReauth(['password']);
		await screen.getByLabelText('Password', { exact: true }).fill('wrong');
		await screen.getByRole('button', { name: 'Confirm' }).click();
		await expect.element(screen.getByText('Incorrect password.')).toBeVisible();
		await expect.element(screen.getByRole('dialog')).toBeVisible();
	});

	it('asks for a code, with a switch to a recovery code', async () => {
		mockedCode.mockResolvedValue();
		const screen = await render(ReauthPrompt);
		const asked = requestReauth(['code']);
		await expect.element(screen.getByLabelText('Code from your app')).toBeVisible();
		expect(screen.getByLabelText('Password', { exact: true }).query()).toBeNull();
		await screen.getByRole('button', { name: 'Use a recovery code' }).click();
		await screen.getByLabelText('Recovery code').fill('mock0001');
		await screen.getByRole('button', { name: 'Confirm' }).click();
		expect(await asked).toBe(true);
		expect(mockedCode).toHaveBeenCalledWith('mock0001');
	});

	it('switches between the password and a code when both are offered', async () => {
		const screen = await render(ReauthPrompt);
		void requestReauth(['password', 'code']);
		await expect.element(screen.getByLabelText('Password', { exact: true })).toBeVisible();
		await screen.getByRole('button', { name: 'Use a code instead' }).click();
		await expect.element(screen.getByLabelText('Code from your app')).toBeVisible();
		await screen.getByRole('button', { name: 'Use your password instead' }).click();
		await expect.element(screen.getByLabelText('Password', { exact: true })).toBeVisible();
	});

	it('resolves false on Cancel and shows no error', async () => {
		const screen = await render(ReauthPrompt);
		const asked = requestReauth(['password']);
		await screen.getByRole('button', { name: 'Cancel' }).click();
		expect(await asked).toBe(false);
		expect(mockedPassword).not.toHaveBeenCalled();
		expect(screen.getByRole('alert').query()).toBeNull();
	});

	it('starts empty the next time it opens', async () => {
		const screen = await render(ReauthPrompt);
		void requestReauth(['password']);
		await screen.getByLabelText('Password', { exact: true }).fill('typed');
		await screen.getByRole('button', { name: 'Cancel' }).click();
		void requestReauth(['password']);
		await expect.element(screen.getByLabelText('Password', { exact: true })).toHaveValue('');
	});
});
