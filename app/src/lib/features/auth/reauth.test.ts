import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppError, toAppError } from '#lib/api/index.js';
import { ReauthCancelled, reauthPrompt, requestReauth, withReauth } from './reauth.svelte';
import { session } from './session.svelte';

const allauthReauth = (ids: string[]) =>
	toAppError(
		{
			status: 401,
			data: { flows: ids.map((id) => ({ id })), user: {}, methods: [] },
			meta: { is_authenticated: true }
		},
		new Response(null, { status: 401 })
	);

const openReauth = () =>
	toAppError(
		{ code: 'reauthentication_required', message: 'x', errors: [] },
		new Response(null, { status: 403 })
	);

/** Answer the prompt as the player would, once it opens. */
async function answer(ok: boolean): Promise<void> {
	await vi.waitFor(() => expect(reauthPrompt.request).not.toBeNull());
	reauthPrompt.settle(ok);
}

afterEach(() => {
	reauthPrompt.settle(false);
	session.reset();
});

describe('withReauth', () => {
	it('runs the call once when it needs no reauthentication', async () => {
		const call = vi.fn(async () => 'done');
		expect(await withReauth(call)).toBe('done');
		expect(call).toHaveBeenCalledOnce();
		expect(reauthPrompt.request).toBeNull();
	});

	it('asks, then sends the call once more after a reauthentication', async () => {
		const call = vi
			.fn<() => Promise<string>>()
			.mockRejectedValueOnce(allauthReauth(['reauthenticate']))
			.mockResolvedValueOnce('done');
		const result = withReauth(call);
		await answer(true);
		expect(await result).toBe('done');
		expect(call).toHaveBeenCalledTimes(2);
	});

	it('asks with the methods the error offers, for both error shapes', async () => {
		const first = withReauth(
			vi
				.fn<() => Promise<void>>()
				.mockRejectedValueOnce(allauthReauth(['mfa_reauthenticate']))
				.mockResolvedValueOnce()
		);
		await vi.waitFor(() => expect(reauthPrompt.request?.methods).toEqual(['code']));
		reauthPrompt.settle(true);
		await first;
		const second = withReauth(
			vi.fn<() => Promise<void>>().mockRejectedValueOnce(openReauth()).mockResolvedValueOnce()
		);
		await vi.waitFor(() => expect(reauthPrompt.request?.methods).toEqual(['password', 'code']));
		reauthPrompt.settle(true);
		await second;
	});

	it('throws ReauthCancelled on Cancel and does not send the call again', async () => {
		const call = vi.fn(async () => {
			throw allauthReauth(['reauthenticate']);
		});
		const result = withReauth(call);
		await answer(false);
		await expect(result).rejects.toBeInstanceOf(ReauthCancelled);
		expect(call).toHaveBeenCalledOnce();
	});

	it('throws a second reauthentication error as it is, without asking again', async () => {
		const again = allauthReauth(['reauthenticate']);
		const call = vi
			.fn<() => Promise<void>>()
			.mockRejectedValueOnce(allauthReauth(['reauthenticate']))
			.mockRejectedValueOnce(again);
		const result = withReauth(call);
		await answer(true);
		await expect(result).rejects.toBe(again);
		expect(reauthPrompt.request).toBeNull();
	});

	it('throws any other error at once, without asking', async () => {
		const other = new AppError({
			kind: 'validation',
			status: 400,
			code: 'incorrect_code',
			message: 'x',
			fields: {}
		});
		await expect(withReauth(async () => Promise.reject(other))).rejects.toBe(other);
		expect(reauthPrompt.request).toBeNull();
	});
});

describe('requestReauth', () => {
	it('leaves out the code for an account known to have no two-factor', async () => {
		session.apply({ status: 'signed_in', email: 'player@example.com' });
		session.mfaEnrolled = false;
		const asked = requestReauth(['password', 'code']);
		expect(reauthPrompt.request?.methods).toEqual(['password']);
		reauthPrompt.settle(true);
		expect(await asked).toBe(true);
	});

	it('shares one prompt between two calls that ask at the same time', async () => {
		const first = requestReauth(['password']);
		const second = requestReauth(['password']);
		reauthPrompt.settle(true);
		expect(await Promise.all([first, second])).toEqual([true, true]);
	});
});
