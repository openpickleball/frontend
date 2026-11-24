import { HttpResponse, http } from 'msw';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	AppError,
	type AppErrorFields,
	allauthParams,
	createApi,
	isAppError,
	type Api
} from '#lib/api/index.js';
import { buildCode, parsePlayerCode, type MatchInput, type PlayerCode } from '#lib/domain/index.js';
import { MOCK_PASSWORD, PLAYERS, VERIFIED_EMAIL } from '#lib/mocks/fixtures.js';
import { server, useMockApi } from '#lib/mocks/node.js';
import { duplicateMatchCode, submitMatch } from './service';

useMockApi();

const BASE = 'http://localhost';

function codeOf(key: string): PlayerCode {
	const found = PLAYERS.find((p) => p.key === key)!;
	const parsed = parsePlayerCode(found.code);
	if (!parsed.ok) throw new Error('bad fixture code');
	return parsed.value;
}
const tamsin = codeOf('tamsin');

/** The real client with a cookie jar, as a browser has. */
function browserApi(): Api {
	const jar = new Map<string, string>();
	const fetchWithJar: typeof fetch = async (input, init) => {
		const response = await fetch(input, init);
		for (const line of response.headers.getSetCookie()) {
			const [pair] = line.split(';');
			const [name, ...value] = pair.split('=');
			jar.set(name.trim(), value.join('='));
		}
		return response;
	};
	const getCookies = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
	return createApi({ baseUrl: BASE, fetch: fetchWithJar, getCookies });
}

let api: Api;

afterEach(() => server.events.removeAllListeners());

beforeEach(async () => {
	api = browserApi();
	await api.initCsrf();
	const login = await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
		params: allauthParams,
		body: { email: VERIFIED_EMAIL, password: MOCK_PASSWORD }
	});
	expect(login.response.status).toBe(200);
});

const singles: MatchInput = {
	format: 'singles',
	playedOn: '2026-11-16',
	teamA: [tamsin],
	teamB: [codeOf('kit')],
	games: [{ teamA: 11, teamB: 6 }]
};

async function failure(promise: Promise<unknown>): Promise<AppError> {
	try {
		await promise;
	} catch (cause) {
		if (isAppError(cause)) return cause;
		throw cause;
	}
	throw new Error('expected the call to fail');
}

describe('submitMatch', () => {
	it('creates the match with the submitter team confirmed', async () => {
		const { match } = await submitMatch(singles, tamsin, { api });
		expect(match.code).toMatch(/^M-/);
		expect(match.format).toBe('singles');
		expect(match.playedOn).toBe('2026-11-16');
		expect(match.games).toEqual([{ number: 1, teamA: 11, teamB: 6 }]);
		// One confirmation, from the submitter's team, so the match waits on the other team only.
		expect(match.status).toBe('pending');
		expect(match.viewerSide).toBe('a');
		expect(match.confirmedBySide).toEqual({ a: true, b: false });
		const mine = match.teamA.players.find((p) => p.code === tamsin);
		expect(mine?.displayName).toBe('Tamsin Vale');
	});

	it('sends only the create request', async () => {
		const sent: string[] = [];
		server.events.on('request:start', ({ request }) => {
			const path = new URL(request.url).pathname;
			if (path.startsWith('/api/v1/matches')) sent.push(`${request.method} ${path}`);
		});
		const result = await submitMatch(singles, tamsin, { api });
		expect(sent).toEqual(['POST /api/v1/matches/']);
		expect(Object.keys(result)).toEqual(['match']);
	});

	it('works when the submitter is on team B', async () => {
		const input: MatchInput = { ...singles, teamA: [codeOf('kit')], teamB: [tamsin] };
		const { match } = await submitMatch({ ...input, games: [{ teamA: 6, teamB: 11 }] }, tamsin, {
			api
		});
		expect(match.teamB.players[0].code).toBe(tamsin);
	});

	it('sends doubles with the inferred best of and the chosen rules', async () => {
		let body: Record<string, unknown> | undefined;
		server.events.on('request:start', async ({ request }) => {
			if (request.method === 'POST' && request.url.endsWith('/api/v1/matches/')) {
				body = (await request.clone().json()) as Record<string, unknown>;
			}
		});
		const { match } = await submitMatch(
			{
				format: 'doubles',
				playedOn: '2026-11-16',
				teamA: [tamsin, codeOf('oren')],
				teamB: [codeOf('kit'), codeOf('bea')],
				games: [
					{ teamA: 15, teamB: 9 },
					{ teamA: 12, teamB: 15 },
					{ teamA: 15, teamB: 10 }
				],
				gameTarget: 15,
				scoringType: 'rally'
			},
			tamsin,
			{ api }
		);
		expect(match.bestOf).toBe(3);
		expect(match.gameTarget).toBe(15);
		expect(match.scoringType).toBe('rally');
		await expect.poll(() => body).toBeDefined();
		expect(body).toMatchObject({ best_of: 3, game_target: 15, scoring_type: 'rally' });
	});

	it('maps a 422 from the server onto its field keys', async () => {
		server.use(
			http.post('*/api/v1/matches/', () =>
				HttpResponse.json(
					{
						code: 'validation_error',
						message: 'The request is not valid.',
						errors: [
							{
								field: 'body.team_b.0',
								code: 'unknown_player',
								message: 'No player has this OPEN code.'
							},
							{ field: 'body.games.1', code: 'not_won_by_two', message: 'Game 2 is not won by 2.' }
						]
					},
					{ status: 422 }
				)
			)
		);
		const error = await failure(submitMatch(singles, tamsin, { api }));
		expect(error.kind).toBe('validation');
		expect(error.status).toBe(422);
		expect(error.fields['team_b.0']).toEqual(['No player has this OPEN code.']);
		expect(error.fields['games.1']).toEqual(['Game 2 is not won by 2.']);
	});

	it('maps an unknown player from the mock backend to team_b.0', async () => {
		// A valid code that no fixture player has: only the server can know.
		const unknown = parsePlayerCode(buildCode('player', 'ZZZZZZZ'));
		if (!unknown.ok) throw new Error('bad test code');
		const error = await failure(
			submitMatch({ ...singles, teamB: [unknown.value] }, tamsin, { api })
		);
		expect(error.kind).toBe('validation');
		expect(error.fields['team_b.0']).toBeDefined();
	});

	it('catches a score the rules refuse before sending anything', async () => {
		let sent = false;
		server.events.on('request:start', ({ request }) => {
			if (request.url.endsWith('/api/v1/matches/')) sent = true;
		});
		const error = await failure(
			submitMatch({ ...singles, games: [{ teamA: 11, teamB: 10 }] }, tamsin, { api })
		);
		expect(error.kind).toBe('validation');
		expect(error.fields['games.0']).toBeDefined();
		expect(sent).toBe(false);
	});

	it('refuses a match the submitter is not in, before the backend does', async () => {
		const error = await failure(
			submitMatch({ ...singles, teamA: [codeOf('oren')] }, tamsin, { api })
		);
		expect(error.kind).toBe('forbidden');
		expect(error.code).toBe('not_a_player');
	});

	it('reports a duplicate with the earlier match code', async () => {
		const first = await submitMatch(singles, tamsin, { api });
		const error = await failure(submitMatch(singles, tamsin, { api }));
		expect(error.kind).toBe('duplicate');
		expect(error.status).toBe(409);
		expect(duplicateMatchCode(error)).toBe(first.match.code);
	});

	it('reports a duplicate that names no match as null', () => {
		const error = new AppError({
			kind: 'duplicate',
			status: 409,
			code: 'duplicate_match',
			message: 'This match was already submitted.',
			fields: {}
		});
		expect(duplicateMatchCode(error)).toBeNull();
		expect(duplicateMatchCode({ ...error, kind: 'validation', code: 'x' })).toBeNull();
	});

	it('reports a network failure and creates nothing', async () => {
		server.use(http.post('*/api/v1/matches/', () => HttpResponse.error()));
		const error = await failure(submitMatch(singles, tamsin, { api }));
		expect(error.kind).toBe('network');
		expect(error.status).toBeNull();
	});
});

describe('duplicateMatchCode', () => {
	const inMessage = buildCode('match', 'ABCDEFGHJKM');
	const structured = buildCode('match', 'WXYZ2345678');
	const duplicate: AppErrorFields = {
		kind: 'duplicate',
		status: 409,
		code: 'duplicate_match',
		message: `This match was already submitted as ${inMessage}.`,
		fields: {}
	};

	it('prefers existingCode over the code in the message', () => {
		const error = new AppError({ ...duplicate, existingCode: structured });
		expect(duplicateMatchCode(error)).toBe(structured);
	});

	it('reads the code from the message when existingCode is unset', () => {
		expect(duplicateMatchCode(new AppError(duplicate))).toBe(inMessage);
	});

	it('falls back to the message when existingCode is not a valid code', () => {
		const error = new AppError({ ...duplicate, existingCode: 'not a code' });
		expect(duplicateMatchCode(error)).toBe(inMessage);
	});

	it('ignores existingCode on an error that is not a duplicate', () => {
		const error = new AppError({
			...duplicate,
			kind: 'conflict',
			code: 'conflict',
			existingCode: structured
		});
		expect(duplicateMatchCode(error)).toBeNull();
	});
});
