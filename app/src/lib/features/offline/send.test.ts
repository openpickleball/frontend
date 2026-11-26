import { describe, expect, it } from 'vitest';
import { createApi } from '#lib/api/index.js';
import { sendQueued } from './send.js';
import type { MatchBody } from './types.js';

// Made-up players.
const body: MatchBody = {
	format: 'singles',
	played_on: '2026-11-14',
	team_a: ['P-AAAA-BBBB'],
	team_b: ['P-CCCC-DDDD'],
	games: [{ team_a: 11, team_b: 6 }]
};

const json = (status: number, payload: unknown) =>
	new Response(JSON.stringify(payload), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

/** A client whose every call to `matches/` gets `answer`. The CSRF cookie is already set. */
function apiAnswering(answer: () => Response | Promise<Response>) {
	const calls: Request[] = [];
	const api = createApi({
		baseUrl: 'http://localhost',
		getCookies: () => 'csrftoken=made-up-token',
		fetch: async (input, init) => {
			const request = new Request(input, init);
			calls.push(request);
			return answer();
		}
	});
	return { api, calls };
}

const ninja = (code: string, message: string, errors: unknown[] = []) => ({
	code,
	message,
	errors
});

describe('sendQueued', () => {
	it('sends the body as it was queued, with the CSRF header', async () => {
		const { api, calls } = apiAnswering(() => json(500, ninja('error', 'Internal')));
		await sendQueued(body, { api });
		expect(calls).toHaveLength(1);
		expect(calls[0].method).toBe('POST');
		expect(new URL(calls[0].url).pathname).toBe('/api/v1/matches/');
		expect(calls[0].headers.get('X-CSRFToken')).toBe('made-up-token');
		expect(await calls[0].json()).toEqual(body);
	});

	it('2xx that cannot be read still counts as sent', async () => {
		const { api } = apiAnswering(() => json(201, { code: 'not a code' }));
		expect(await sendQueued(body, { api })).toEqual({ kind: 'sent', match: null });
	});

	it('409 duplicate_match with existing_code counts as sent', async () => {
		const { api } = apiAnswering(() =>
			json(
				409,
				ninja('duplicate_match', 'This match was already submitted as M-9QF6-RD2K-X3BP.', [
					{
						field: 'match',
						code: 'duplicate_match',
						message: 'x',
						existing_code: 'M-9QF6-RD2K-X3BP'
					}
				])
			)
		);
		expect(await sendQueued(body, { api })).toEqual({
			kind: 'duplicate',
			code: 'M-9QF6-RD2K-X3BP'
		});
	});

	it('409 duplicate_match that names no match is refused, for the player to see', async () => {
		const { api } = apiAnswering(() =>
			json(
				409,
				ninja('duplicate_match', 'This match was already submitted.', [
					{ field: 'match', code: 'duplicate_match', message: 'x' }
				])
			)
		);
		const outcome = await sendQueued(body, { api });
		expect(outcome).toMatchObject({ kind: 'refused', problem: { kind: 'duplicate' } });
	});

	it('401 waits for sign-in', async () => {
		const { api } = apiAnswering(() =>
			json(401, ninja('unauthorized', 'Authentication required.'))
		);
		expect(await sendQueued(body, { api })).toEqual({ kind: 'signin' });
	});

	it('422 is refused with the field errors', async () => {
		const { api } = apiAnswering(() =>
			json(
				422,
				ninja('validation_error', 'The request is not valid.', [
					{ field: 'body.team_b.0', code: 'unknown_player', message: 'No player has this code.' }
				])
			)
		);
		expect(await sendQueued(body, { api })).toEqual({
			kind: 'refused',
			problem: {
				kind: 'invalid',
				message: "Some details weren't accepted.",
				fields: { 'team_b.0': ['No player has this code.'] }
			}
		});
	});

	it('403 forbidden is refused', async () => {
		const { api } = apiAnswering(() => json(403, ninja('forbidden', 'Not allowed.')));
		expect(await sendQueued(body, { api })).toMatchObject({
			kind: 'refused',
			problem: { kind: 'refused' }
		});
	});

	it('5xx, 429 and a CSRF failure keep it for later', async () => {
		for (const response of [
			() => json(500, ninja('error', 'Internal')),
			() => new Response('<h1>Bad gateway</h1>', { status: 502 }),
			() => json(429, ninja('throttled', 'Too many.')),
			() => json(403, ninja('forbidden', 'CSRF check Failed'))
		]) {
			const { api } = apiAnswering(response);
			expect(await sendQueued(body, { api })).toEqual({ kind: 'retry', offline: false });
		}
	});

	it('no answer keeps it as offline', async () => {
		const { api } = apiAnswering(() => Promise.reject(new TypeError('Failed to fetch')));
		expect(await sendQueued(body, { api })).toEqual({ kind: 'retry', offline: true });
	});
});
