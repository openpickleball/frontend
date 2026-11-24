import { getResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { buildCode } from '../../domain/codes';
import { PLAYERS } from '../fixtures';
import { createMockStore } from '../store';
import { createMissingHandlers } from './index';

const BASE = 'http://localhost';
const tamsin = PLAYERS[0].code;

describe('createMissingHandlers (PUBLIC_API_MOCK=missing)', () => {
	const handlers = createMissingHandlers(createMockStore());

	it('answers the ratings endpoint, for any well-formed code', async () => {
		const known = await getResponse(
			handlers,
			new Request(`${BASE}/api/v1/players/${tamsin}/ratings`)
		);
		expect(known?.status).toBe(200);
		const unknown = await getResponse(
			handlers,
			new Request(`${BASE}/api/v1/players/${buildCode('player', 'ZZZZ9ZZ')}/ratings`)
		);
		expect(unknown?.status).toBe(200);
	});

	it.each([
		['GET', '/api/v1/me/player'],
		['POST', '/api/v1/me/player'],
		['PATCH', '/api/v1/me/player'],
		['GET', `/api/v1/players/${tamsin}`]
	])('leaves %s %s to the real backend', async (method, path) => {
		const request = new Request(`${BASE}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: method === 'GET' ? undefined : JSON.stringify({ display_name: 'Fern Mock' })
		});
		expect(await getResponse(handlers, request)).toBeUndefined();
	});
});
