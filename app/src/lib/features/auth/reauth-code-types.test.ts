/**
 * Review finding M (frontend#261): allauth's `mfa_reauthenticate` flow says which kinds of code it
 * takes (`types`). `reauthFlowsOf` dropped them, so the prompt always offered a recovery code.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { reauthCodeTypesOf, toAppError } from '#lib/api/index.js';
import { reauthPrompt, withReauth } from './reauth.svelte';

const codeFlow = (types?: string[]) =>
	toAppError(
		{
			status: 401,
			data: {
				flows: [{ id: 'mfa_reauthenticate', ...(types ? { types } : {}) }],
				user: {},
				methods: []
			},
			meta: { is_authenticated: true }
		},
		new Response(null, { status: 401 })
	);

afterEach(() => reauthPrompt.settle(false));

describe('reauthCodeTypesOf', () => {
	it('reads the kinds of code the flow takes', () => {
		expect(reauthCodeTypesOf(codeFlow(['totp']))).toEqual(['totp']);
		expect(reauthCodeTypesOf(codeFlow(['totp', 'recovery_codes']))).toEqual([
			'totp',
			'recovery_codes'
		]);
	});

	it('takes a code from the app when the flow names none', () => {
		expect(reauthCodeTypesOf(codeFlow())).toEqual(['totp']);
	});
});

describe('withReauth', () => {
	it('opens the prompt with the kinds of code the backend offers', async () => {
		const result = withReauth(
			vi
				.fn<() => Promise<void>>()
				.mockRejectedValueOnce(codeFlow(['totp']))
				.mockResolvedValueOnce()
		);
		await vi.waitFor(() => expect(reauthPrompt.request?.codeTypes).toEqual(['totp']));
		reauthPrompt.settle(true);
		await result;
	});
});
