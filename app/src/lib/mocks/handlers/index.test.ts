import { getResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { PLAYERS } from '../fixtures';
import { createMissingHandlers } from './index';

const BASE = 'http://localhost';
const tamsin = PLAYERS[0].code;

describe('createMissingHandlers (PUBLIC_API_MOCK=missing)', () => {
	const handlers = createMissingHandlers();

	it.each([
		['GET', '/api/v1/me/player'],
		['POST', '/api/v1/me/player'],
		['PATCH', '/api/v1/me/player'],
		['GET', `/api/v1/players/${tamsin}`],
		['GET', `/api/v1/players/${tamsin}/ratings`],
		['GET', `/api/v1/players/${tamsin}/rating-history`]
	])('leaves %s %s to the real backend', async (method, path) => {
		const request = new Request(`${BASE}${path}`, {
			method,
			headers: { 'Content-Type': 'application/json' },
			body: method === 'GET' ? undefined : JSON.stringify({ city: 'Vexmoor' })
		});
		expect(await getResponse(handlers, request)).toBeUndefined();
	});
});
