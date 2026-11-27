/**
 * Review finding O (frontend#261):
 * - A second call that asked while the prompt was open joined it, but its ways to confirm were
 *   dropped.
 * - A second refusal after the retry was thrown as the raw 401, which screens show as "You're not
 *   signed in". It should say the confirmation did not work.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toAppError } from '#lib/api/index.js';
import { reauthPrompt, requestReauth, withReauth } from './reauth.svelte';
import { session } from './session.svelte';

const allauthReauth = () =>
	toAppError(
		{
			status: 401,
			data: { flows: [{ id: 'reauthenticate' }], user: {}, methods: [] },
			meta: { is_authenticated: true }
		},
		new Response(null, { status: 401 })
	);

afterEach(() => {
	reauthPrompt.settle(false);
	session.reset();
});

describe('joining an open prompt', () => {
	it('offers every way either call asked for, the password first', async () => {
		const first = requestReauth(['code']);
		const second = requestReauth(['password']);
		expect(reauthPrompt.request?.methods).toEqual(['password', 'code']);
		reauthPrompt.settle(true);
		expect(await Promise.all([first, second])).toEqual([true, true]);
	});
});

describe('a second refusal after the retry', () => {
	it('says the confirmation did not work, not that the player is signed out', async () => {
		const call = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(allauthReauth())
			.mockRejectedValueOnce(allauthReauth());
		const result = withReauth(call);
		await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
		reauthPrompt.settle(true);
		await expect(result).rejects.toMatchObject({
			message: "We couldn't confirm it's you. Try again."
		});
		expect(call).toHaveBeenCalledTimes(2);
		expect(reauthPrompt.request).toBeNull();
	});
});
