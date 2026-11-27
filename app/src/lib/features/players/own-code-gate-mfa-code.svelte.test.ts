/**
 * Review finding T1 (frontend#261): for an account with two-factor whose session has not passed
 * it (it turned two-factor on from another device), the gate linked to the two-factor page, which
 * says two-factor is on and has no way to confirm. The gate offers the code instead, and tries
 * again once the player confirmed.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import type { PlayerCode } from '#lib/domain/index.js';
import { checkMfaEnrolled, reauthPrompt, session } from '#lib/features/auth/index.js';
import { myCode } from './my-code.svelte.js';
import OwnCodeGate from './own-code-gate.svelte';

vi.mock('#lib/features/auth/index.js', async (importOriginal) => ({
	...(await importOriginal<Record<string, unknown>>()),
	checkMfaEnrolled: vi.fn()
}));

const children = createRawSnippet((code: () => PlayerCode) => ({
	render: () => `<p>${code()}</p>`
}));

let load: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	myCode.reset();
	session.apply({ status: 'signed_in', email: 'organizer@example.com' });
	load = vi.spyOn(myCode, 'load').mockResolvedValue();
});

afterEach(() => {
	load.mockRestore();
	reauthPrompt.settle(false);
	vi.mocked(checkMfaEnrolled).mockReset();
});

describe('OwnCodeGate when two-factor is on but this session has not passed it', () => {
	it('offers the code prompt, not the setup link, and tries again after it', async () => {
		session.mfaEnrolled = true;
		myCode.status = 'mfa-required';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await page.getByRole('button', { name: 'Enter a code' }).click();
		expect(page.getByRole('link', { name: 'Set up two-factor' }).query()).toBeNull();
		await vi.waitFor(() => expect(reauthPrompt.request?.methods).toEqual(['code']));
		load.mockClear();
		reauthPrompt.settle(true);
		await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
	});

	it('reads two-factor again when it is unknown, then offers the code', async () => {
		session.mfaEnrolled = null;
		vi.mocked(checkMfaEnrolled).mockImplementation(async () => {
			session.mfaEnrolled = true;
			return true;
		});
		myCode.status = 'mfa-required';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect.element(page.getByRole('button', { name: 'Enter a code' })).toBeVisible();
		expect(checkMfaEnrolled).toHaveBeenCalled();
	});

	it('keeps the setup link for an account without two-factor', async () => {
		session.mfaEnrolled = false;
		myCode.status = 'mfa-required';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect.element(page.getByRole('link', { name: 'Set up two-factor' })).toBeVisible();
		expect(page.getByRole('button', { name: 'Enter a code' }).query()).toBeNull();
	});
});
