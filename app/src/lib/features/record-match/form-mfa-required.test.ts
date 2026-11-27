/**
 * Review finding G, the record form (frontend#261): a 403 `mfa_required` on a correction showed
 * the correction permission copy. It explains two-factor instead, as a new match already did.
 */
import { describe, expect, it } from 'vitest';
import { AppError } from '#lib/api/index.js';
import type { PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import { RecordForm } from './form.svelte.js';

const code = (key: string) => PLAYERS.find((p) => p.key === key)?.code as PlayerCode;

const mfaRequired = new AppError({
	kind: 'forbidden',
	status: 403,
	code: 'mfa_required',
	message:
		'This needs two-factor authentication. Set it up or confirm with a code, then try again.',
	fields: {}
});

function filled(correcting: boolean): RecordForm {
	const form = new RecordForm(code('tamsin'), { correcting });
	form.partner.code = code('oren');
	form.opponents[0].code = code('kit');
	form.opponents[1].code = code('bea');
	form.games[0] = { a: '11', b: '7' };
	return form;
}

describe('RecordForm on a 403 mfa_required', () => {
	it.each([
		['a correction', true],
		['a new match', false]
	])('explains two-factor on %s', async (_, correcting) => {
		const form = filled(correcting);
		await form.send(() => Promise.reject(mfaRequired));
		expect(form.failure?.message).toBe(mfaRequired.message);
	});
});
