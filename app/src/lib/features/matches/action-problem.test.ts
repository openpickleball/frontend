/**
 * Review finding G, the match page (frontend#261): a 403 `mfa_required` on a confirm, dispute,
 * withdraw or vouch showed "You can only confirm or dispute a match you played in." and the like.
 * It explains two-factor instead.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { actionProblem } from './action-problem.js';

const mfaRequired = new AppError({
	kind: 'forbidden',
	status: 403,
	code: 'mfa_required',
	message:
		'This needs two-factor authentication. Set it up or confirm with a code, then try again.',
	fields: {}
});

describe('actionProblem for a 403 mfa_required', () => {
	it.each(['confirm', 'dispute', 'withdraw', 'vouch'] as const)(
		'explains two-factor on %s',
		(action) => {
			expect(actionProblem(mfaRequired, action)).toBe(mfaRequired.message);
		}
	);

	it('keeps the permission copy for a plain 403', () => {
		const forbidden = new AppError({
			kind: 'forbidden',
			status: 403,
			code: 'forbidden',
			message: 'x',
			fields: {}
		});
		expect(actionProblem(forbidden, 'confirm')).toBe(
			'You can only confirm or dispute a match you played in.'
		);
	});
});
