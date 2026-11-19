import { describe, expect, it } from 'vitest';
import { isAppError, networkError, toAppError } from './errors';

function res(status: number, body?: string, contentType = 'application/json'): Response {
	return new Response(body, { status, headers: { 'Content-Type': contentType } });
}

describe('toAppError: ninja errors', () => {
	it('maps a 422 and strips the body. prefix from field paths', () => {
		const error = toAppError(
			{
				code: 'validation_error',
				message: 'The request is not valid.',
				errors: [
					{ field: 'body.games.1', code: 'tie', message: 'Scores cannot be tied.' },
					{ field: 'body.games.1', code: 'not_won_by_two', message: 'Win by two.' },
					{ field: 'body.team_a.0', code: 'unknown_player', message: 'Unknown player.' }
				]
			},
			res(422)
		);
		expect(error).toEqual({
			kind: 'validation',
			status: 422,
			code: 'validation_error',
			message: 'The request is not valid.',
			fields: {
				'games.1': ['Scores cannot be tied.', 'Win by two.'],
				'team_a.0': ['Unknown player.']
			}
		});
	});

	it('maps the 401 unauthorized body', () => {
		const error = toAppError(
			{ code: 'unauthorized', message: 'Authentication required.', errors: [] },
			res(401)
		);
		expect(error).toMatchObject({ kind: 'unauthenticated', status: 401, code: 'unauthorized' });
	});

	it('maps a 403 CSRF failure to csrf', () => {
		const error = toAppError(
			{ code: 'forbidden', message: 'CSRF check Failed', errors: [] },
			res(403)
		);
		expect(error).toMatchObject({ kind: 'csrf', status: 403, code: 'forbidden' });
		expect(error.message).toBe('Your session check failed. Reload the page, then try again.');
	});

	it('maps any other 403 to forbidden, with our own message', () => {
		const error = toAppError(
			{ code: 'forbidden', message: 'You are not part of this match.', errors: [] },
			res(403)
		);
		expect(error).toMatchObject({
			kind: 'forbidden',
			message: "You can't do that. Only the players in a match can change it."
		});
	});

	it.each([
		[
			401,
			'unauthorized',
			'Authentication required.',
			"You're not signed in. Sign in, then try again."
		],
		[
			409,
			'conflict',
			'Conflict thing',
			"That can't be done right now. Reload the page to see the latest, then try again."
		],
		[429, 'throttled', 'Too many requests.', 'Too many attempts. Wait a moment and try again.'],
		[500, 'error', 'Internal', 'Something went wrong on our side. Wait a moment, then try again.']
	])('never shows the backend text for a %i', (status, code, text, message) => {
		const error = toAppError({ code, message: text, errors: [] }, res(status));
		expect(error.message).toBe(message);
	});

	it('keeps the backend text for a 422 with no field', () => {
		const error = toAppError(
			{ code: 'validation_error', message: 'A match needs at least one game.', errors: [] },
			res(422)
		);
		expect(error.message).toBe('A match needs at least one game.');
	});

	it('maps 404 not_found', () => {
		const error = toAppError({ code: 'not_found', message: 'Not found.', errors: [] }, res(404));
		expect(error).toMatchObject({ kind: 'not_found', status: 404 });
	});

	it('maps a 409 duplicate_match to duplicate and keeps the field', () => {
		const error = toAppError(
			{
				code: 'duplicate_match',
				message: 'This match was already recorded as M-ABCD-EFGH-JKMN.',
				errors: [
					{
						field: 'match',
						code: 'duplicate_match',
						message: 'This match was already recorded as M-ABCD-EFGH-JKMN.'
					}
				]
			},
			res(409)
		);
		expect(error.kind).toBe('duplicate');
		expect(error.code).toBe('duplicate_match');
		expect(error.fields).toEqual({
			match: ['This match was already recorded as M-ABCD-EFGH-JKMN.']
		});
	});

	it('maps a repeated external id to duplicate', () => {
		const error = toAppError(
			{
				code: 'duplicate_match',
				message: 'Already recorded.',
				errors: [
					{ field: 'external_id', code: 'duplicate_external_id', message: 'Already recorded.' }
				]
			},
			res(409)
		);
		expect(error.kind).toBe('duplicate');
	});

	it('maps a 409 conflict', () => {
		const error = toAppError(
			{ code: 'conflict', message: 'Already disputed.', errors: [] },
			res(409)
		);
		expect(error).toMatchObject({ kind: 'conflict', status: 409, code: 'conflict' });
	});

	it('maps a ninja 429 to server with the throttled code', () => {
		const error = toAppError({ code: 'throttled', message: 'Slow down.', errors: [] }, res(429));
		expect(error).toMatchObject({ kind: 'server', status: 429, code: 'throttled' });
	});
});

describe('toAppError: allauth errors', () => {
	it('maps a 400 and keeps param as the field', () => {
		const error = toAppError(
			{
				status: 400,
				errors: [
					{ code: 'invalid', param: 'email', message: 'Enter a valid email address.' },
					{ code: 'too_short', param: 'password', message: 'Too short.' }
				]
			},
			res(400)
		);
		expect(error).toEqual({
			kind: 'validation',
			status: 400,
			code: 'invalid',
			message: 'Enter a valid email address.',
			fields: { email: ['Enter a valid email address.'], password: ['Too short.'] }
		});
	});

	it('keeps an error with no param as the message only', () => {
		const error = toAppError(
			{
				status: 400,
				errors: [{ code: 'email_password_mismatch', message: 'The email or password is wrong.' }]
			},
			res(400)
		);
		expect(error).toMatchObject({
			kind: 'validation',
			code: 'email_password_mismatch',
			message: 'The email or password is wrong.',
			fields: {}
		});
	});

	it('hands back a 401 with flows as session state', () => {
		const error = toAppError(
			{
				status: 401,
				data: { flows: [{ id: 'verify_email', is_pending: true }, { id: 'login' }] },
				meta: { is_authenticated: false }
			},
			res(401)
		);
		expect(error.kind).toBe('unauthenticated');
		expect(error.status).toBe(401);
		expect(error.flows).toEqual([{ id: 'verify_email', is_pending: true }, { id: 'login' }]);
	});

	it('maps a 410 gone session to unauthenticated', () => {
		const error = toAppError(
			{ status: 410, data: {}, meta: { is_authenticated: false } },
			res(410)
		);
		expect(error).toMatchObject({ kind: 'unauthenticated', status: 410 });
	});

	it('maps an allauth 409 to conflict', () => {
		const error = toAppError({ status: 409 }, res(409));
		expect(error).toMatchObject({ kind: 'conflict', status: 409 });
	});

	it('maps an allauth {status: 429} to a throttled server error', () => {
		const error = toAppError({ status: 429 }, res(429));
		expect(error).toMatchObject({
			kind: 'server',
			status: 429,
			code: 'throttled',
			message: 'Too many attempts. Wait a moment and try again.'
		});
	});

	it('gives an allauth {status: 410} the session_gone code', () => {
		expect(toAppError({ status: 410 }, res(410))).toMatchObject({
			kind: 'unauthenticated',
			code: 'session_gone'
		});
	});

	it('maps an allauth JSON 403 to forbidden', () => {
		const error = toAppError({ status: 403 }, res(403));
		expect(error).toMatchObject({ kind: 'forbidden', status: 403 });
	});
});

describe('toAppError: non-JSON responses', () => {
	const html = '<!DOCTYPE html><html><body>Secret internal detail</body></html>';

	it('maps Django HTML 404 to not_found with a generic message', () => {
		const error = toAppError(html, res(404, html, 'text/html'));
		expect(error).toMatchObject({ kind: 'not_found', status: 404, code: 'non_json_response' });
		expect(error.message).not.toContain('Secret');
	});

	it('maps a plain-text 405 to server', () => {
		const error = toAppError('Method not allowed', res(405, 'Method not allowed', 'text/plain'));
		expect(error).toMatchObject({ kind: 'server', status: 405 });
		expect(error.message).not.toContain('Method');
	});

	it('maps an HTML 500 to server', () => {
		const error = toAppError(html, res(500, html, 'text/html'));
		expect(error).toMatchObject({ kind: 'server', status: 500 });
	});

	it('maps Django HTML 403 (allauth CSRF failure) to csrf', () => {
		const error = toAppError(html, res(403, html, 'text/html'));
		expect(error).toMatchObject({ kind: 'csrf', status: 403, code: 'csrf_failed' });
	});

	it('maps an empty error body by status', () => {
		expect(toAppError(undefined, res(502))).toMatchObject({ kind: 'server', status: 502 });
		expect(toAppError(undefined, res(404))).toMatchObject({ kind: 'not_found' });
	});

	it('does not point at highlighted fields when a 400 has none', () => {
		const error = toAppError('{oops', res(400, '{oops', 'text/plain'));
		expect(error).toMatchObject({ kind: 'validation', fields: {} });
		expect(error.message).toBe("Something you entered wasn't accepted. Check it and try again.");
		expect(toAppError({ status: 400 }, res(400)).message).toBe(error.message);
	});

	it('maps an unknown JSON shape by status', () => {
		expect(toAppError({ detail: 'x' }, res(500))).toMatchObject({ kind: 'server', status: 500 });
	});

	it('maps a 429 with no JSON to server throttled', () => {
		expect(toAppError('Too many', res(429, 'Too many', 'text/plain'))).toMatchObject({
			kind: 'server',
			code: 'throttled'
		});
	});
});

describe('toAppError: failures with no response', () => {
	it('keeps the network error the client made from a fetch rejection', () => {
		const cause = new TypeError('Failed to fetch');
		const error = toAppError(networkError(cause));
		expect(error).toEqual({
			kind: 'network',
			status: null,
			code: 'network_error',
			message: "We can't reach the server. Check your connection and try again.",
			fields: {},
			cause
		});
	});

	it('maps a body that is not JSON to server, not network', () => {
		const cause = new SyntaxError('Unexpected token < in JSON');
		expect(toAppError(cause)).toEqual({
			kind: 'server',
			status: null,
			code: 'bad_response',
			message: 'Something went wrong on our side. Wait a moment, then try again.',
			fields: {},
			cause
		});
	});

	it('maps an aborted request to server with the aborted code', () => {
		const error = toAppError(new DOMException('The operation was aborted.', 'AbortError'));
		expect(error).toMatchObject({ kind: 'server', status: null, code: 'aborted' });
	});

	it('maps any other thrown error, such as a middleware TypeError, to server', () => {
		const error = toAppError(new TypeError("Cannot read properties of undefined (reading 'x')"));
		expect(error).toMatchObject({ kind: 'server', status: null, code: 'unexpected' });
	});

	it('returns an AppError unchanged', () => {
		const original = toAppError(new TypeError('x'));
		expect(toAppError(original)).toBe(original);
		expect(isAppError(original)).toBe(true);
		expect(isAppError({ kind: 'x' })).toBe(false);
	});
});
