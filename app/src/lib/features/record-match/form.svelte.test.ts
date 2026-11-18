import { describe, expect, it } from 'vitest';
import type { AppError } from '#lib/api/index.js';
import { parseMatchCode, parsePlayerCode, type Match, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import { RecordForm } from './form.svelte.js';
import type { SubmitResult } from './service.js';

function code(key: string): PlayerCode {
	const parsed = parsePlayerCode(PLAYERS.find((p) => p.key === key)!.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}

function filled(): RecordForm {
	const form = new RecordForm(code('tamsin'));
	form.partner.code = code('oren');
	form.opponents[0].code = code('kit');
	form.opponents[1].code = code('bea');
	form.games[0] = { a: '11', b: '7' };
	return form;
}

const rejection: AppError = {
	kind: 'validation',
	status: 422,
	code: 'validation_error',
	message: 'The request is not valid.',
	fields: { 'games.0.team_b': ['Not a valid score.'] }
};

describe('RecordForm server errors', () => {
	it('attaches a 422 to the values that were sent, not to edits made while it was in flight', async () => {
		const form = filled();
		let reject: (e: AppError) => void = () => {};
		const pending = new Promise<SubmitResult>((_, r) => (reject = r));
		const sending = form.send(() => pending);

		// The player edits the game while the request is in flight.
		form.games[0] = { a: '11', b: '9' };
		reject(rejection);
		await sending;

		// The error is for the sent score, so the edited score shows no error.
		expect(form.serverErrors).toEqual({});

		// Editing back to the sent value brings it back: it belongs to what was sent.
		form.games[0] = { a: '11', b: '7' };
		expect(Object.keys(form.serverErrors)).toEqual(['games.0.team_b']);
	});

	it('clears on the next edit of the same field', async () => {
		const form = filled();
		await form.send(() => Promise.reject(rejection));
		expect(Object.keys(form.serverErrors)).toEqual(['games.0.team_b']);
		form.games[0] = { a: '11', b: '8' };
		expect(form.serverErrors).toEqual({});
	});

	it('keeps an error through edits to other fields', async () => {
		const form = filled();
		await form.send(() => Promise.reject(rejection));
		form.playedOn = '2026-01-02';
		expect(Object.keys(form.serverErrors)).toEqual(['games.0.team_b']);
	});

	it('returns the result when the match was recorded', async () => {
		const form = filled();
		const match = { code: parseMatchCode('M-9QF6-RD2K-X3BP') } as unknown as Match;
		const result = await form.send(async () => ({ match, confirmError: null }));
		expect(result?.match).toBe(match);
	});
});
