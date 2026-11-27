/**
 * Review finding G, my code (frontend#261): a 403 `mfa_required` from `me/player` became
 * `error`, which the gates word as a connection problem. It has its own status now, so they can
 * explain two-factor instead.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { createMyCode } from './my-code.svelte.js';

const mfaRequired = () =>
	new AppError({ kind: 'forbidden', status: 403, code: 'mfa_required', message: 'x', fields: {} });

describe('myCode on a 403 mfa_required', () => {
	it('is mfa-required when reading the player is refused', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw mfaRequired();
			}
		});
		await mine.load();
		expect(mine.status).toBe('mfa-required');
		expect(mine.code).toBeNull();
	});

	it('is mfa-required when creating the player is refused', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => 'none',
			createMyPlayer: async () => {
				throw mfaRequired();
			}
		});
		await mine.load();
		expect(mine.status).toBe('mfa-required');
	});
});
