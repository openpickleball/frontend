/**
 * Review finding H (frontend#261): Start over and Continue could run at the same time: each
 * checked only its own busy state.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { session } from '../session.svelte.js';
import { authenticateMfa, cancelMfa } from '../services.js';
import MfaCodeForm from './mfa-code-form.svelte';

vi.mock('../services.js', () => ({ authenticateMfa: vi.fn(), cancelMfa: vi.fn() }));
const mockedAuthenticate = vi.mocked(authenticateMfa);
const mockedCancel = vi.mocked(cancelMfa);

beforeEach(() => {
	session.apply({ status: 'pending_mfa', types: ['totp'] });
});

afterEach(() => {
	mockedAuthenticate.mockReset();
	mockedCancel.mockReset();
	session.reset();
});

describe('MfaCodeForm runs one action at a time', () => {
	it('refuses Start over while the code is being checked', async () => {
		mockedAuthenticate.mockReturnValue(new Promise(() => {}));
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await expect.element(screen.getByRole('button', { name: 'Checking…' })).toBeVisible();
		await screen.getByRole('button', { name: 'Start over' }).click();
		expect(mockedCancel).not.toHaveBeenCalled();
	});

	it('refuses Continue while starting over', async () => {
		mockedCancel.mockReturnValue(new Promise(() => {}));
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		await screen.getByLabelText('Code from your app').fill('123456');
		await screen.getByRole('button', { name: 'Start over' }).click();
		await screen.getByRole('button', { name: 'Continue' }).click();
		expect(mockedAuthenticate).not.toHaveBeenCalled();
	});
});
