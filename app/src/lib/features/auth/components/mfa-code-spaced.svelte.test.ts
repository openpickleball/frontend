/**
 * Review finding B (frontend#261): authenticator apps show a code as `123 456`. The field's
 * `maxlength` of 6 cut a typed or pasted `123 456` to `123 45`, so the space stripping in
 * `parseMfaCode` never got the whole code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { userEvent } from 'vitest/browser';
import { session } from '../session.svelte.js';
import { authenticateMfa } from '../services.js';
import MfaCodeForm from './mfa-code-form.svelte';

vi.mock('../services.js', () => ({ authenticateMfa: vi.fn(), cancelMfa: vi.fn() }));
const mocked = vi.mocked(authenticateMfa);

beforeEach(() => {
	session.apply({ status: 'pending_mfa', types: ['totp', 'recovery_codes'] });
	mocked.mockResolvedValue({ status: 'signed_in', email: 'twofactor@example.com' });
});

afterEach(() => {
	mocked.mockReset();
	session.reset();
});

describe('a code typed or pasted with a space', () => {
	it('keeps a typed "123 456" whole and sends 123456', async () => {
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		const field = screen.getByLabelText('Code from your app');
		await userEvent.type(field, '123 456');
		await expect.element(field).toHaveValue('123 456');
		await screen.getByRole('button', { name: 'Continue' }).click();
		await vi.waitFor(() => expect(mocked).toHaveBeenCalledWith('123456'));
	});

	it('keeps a pasted "123 456" whole', async () => {
		const screen = await render(MfaCodeForm, { onsuccess: vi.fn() });
		const field = screen.getByLabelText('Code from your app');
		await userEvent.click(field);
		// A paste inserts the text at the caret, as this does, and maxlength limits it.
		document.execCommand('insertText', false, '123 456');
		await expect.element(field).toHaveValue('123 456');
	});
});
