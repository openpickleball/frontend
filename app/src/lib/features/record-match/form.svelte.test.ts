import { describe, expect, it } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { parseMatchCode, parsePlayerCode, type Match, type PlayerCode } from '#lib/domain/index.js';
import { PLAYERS } from '#lib/mocks/fixtures.js';
import {
	CORRECT_CONFLICT_MESSAGE,
	CORRECT_FORBIDDEN_MESSAGE,
	ORGANIZER_ONLY_MESSAGE,
	RecordForm
} from './form.svelte.js';
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

const rejection = new AppError({
	kind: 'validation',
	status: 422,
	code: 'validation_error',
	message: 'The request is not valid.',
	fields: { 'games.0.team_b': ['Not a valid score.'] }
});

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
		const result = await form.send(async () => ({ match }));
		expect(result?.match).toBe(match);
	});
});

describe('RecordForm players found by name', () => {
	it('fills the slot with the code and keeps the name', () => {
		const form = new RecordForm(code('tamsin'));
		expect(form.choose(form.partner, { code: code('oren'), name: 'Oren Quill' })).toBe(true);
		expect(form.partner).toMatchObject({ code: code('oren'), name: 'Oren Quill', error: '' });
		expect(form.input.teamA).toEqual([code('tamsin'), code('oren')]);
	});

	it('refuses a player who is already in the match', () => {
		const form = new RecordForm(code('tamsin'));
		form.choose(form.partner, { code: code('oren'), name: 'Oren Quill' });
		expect(form.choose(form.opponents[0], { code: code('oren'), name: 'Oren Quill' })).toBe(false);
		expect(form.opponents[0].code).toBeNull();
		expect(form.opponents[0].error).toBe('This player is already in the match.');
	});

	it('forgets the name when the chip is removed or a typed code replaces it', () => {
		const form = new RecordForm(code('tamsin'));
		form.choose(form.partner, { code: code('oren'), name: 'Oren Quill' });
		form.remove(form.partner);
		expect(form.partner.name).toBe('');
		form.opponents[0].text = code('kit');
		form.commit(form.opponents[0]);
		expect(form.opponents[0].name).toBe('');
	});

	it('lists the codes in the match, so search can leave them out', () => {
		const form = new RecordForm(code('tamsin'));
		form.choose(form.partner, { code: code('oren'), name: 'Oren Quill' });
		expect(form.taken).toEqual([code('tamsin'), code('oren')]);
	});

	it('asks for a pick, not a code, when a half-typed name is left in a slot', () => {
		const form = new RecordForm(code('tamsin'));
		form.partner.text = 'mar';
		expect(form.commit(form.partner)).toBe(false);
		expect(form.partner.error).toBe('Pick a player from the list, or enter their OPEN code.');
		// Text shaped like a code keeps the code messages.
		form.partner.text = 'P-AAAA';
		form.commit(form.partner);
		expect(form.partner.error).toBe('That OPEN code is the wrong length.');
	});
});

describe('RecordForm score and date checks', () => {
	it('says a negative score cannot be negative, not that it is not a whole number', () => {
		const form = filled();
		form.games[0] = { a: '-1', b: '5' };
		form.submitted = true;
		expect(form.errors['games.0']).toEqual(['Game 1: scores cannot be negative.']);
	});

	it('still refuses text that is not a whole number', () => {
		const form = filled();
		form.games[0] = { a: '1.5', b: '5' };
		form.submitted = true;
		expect(form.errors['games.0']).toEqual(['Game 1: enter each score as a whole number.']);
	});

	it('hints, without blocking, at a date long ago', () => {
		const form = filled();
		form.playedOn = '0001-01-01';
		form.submitted = true;
		expect(form.dateHint).toBe('Check the year. This date is more than 25 years ago.');
		expect(form.errors.played_on).toBeUndefined();
		expect(form.input.playedOn).toBe('0001-01-01');
	});

	it('gives no hint for a recent date', () => {
		const form = filled();
		expect(form.dateHint).toBeNull();
		form.playedOn = '2000-01-01';
		expect(form.dateHint).toBeNull();
	});
});

describe('RecordForm correcting a match', () => {
	const refused = (kind: 'not_found' | 'conflict' | 'forbidden', status: number) =>
		new AppError({ kind, status, code: kind, message: 'Refused.', fields: {} });

	function correcting(): RecordForm {
		const form = new RecordForm(code('tamsin'), { correcting: true });
		form.partner.code = code('oren');
		form.opponents[0].code = code('kit');
		form.opponents[1].code = code('bea');
		form.games[0] = { a: '11', b: '7' };
		return form;
	}

	it('says a 404 means only the organizer can change the match', async () => {
		const form = correcting();
		expect(await form.send(() => Promise.reject(refused('not_found', 404)))).toBeNull();
		expect(form.failure).toEqual({ kind: 'organizer', message: ORGANIZER_ONLY_MESSAGE });
	});

	it('says a 409 means the match can no longer be corrected', async () => {
		const form = correcting();
		await form.send(() => Promise.reject(refused('conflict', 409)));
		expect(form.failure).toEqual({ kind: 'conflict', message: CORRECT_CONFLICT_MESSAGE });
	});

	it('words a 403 for a correction', async () => {
		const form = correcting();
		await form.send(() => Promise.reject(refused('forbidden', 403)));
		expect(form.failure).toEqual({ kind: 'forbidden', message: CORRECT_FORBIDDEN_MESSAGE });
	});

	it('puts a 422 on the fields, as for a new match', async () => {
		const form = correcting();
		await form.send(() => Promise.reject(rejection));
		expect(form.failure).toBeNull();
		expect(form.errors['games.0']).toEqual(['Not a valid score.']);
	});

	it('keeps a 404 and a 409 plain when recording a new match', async () => {
		const form = filled();
		await form.send(() => Promise.reject(refused('not_found', 404)));
		expect(form.failure).toEqual({ kind: 'other', message: 'Refused.' });
	});
});
