import { describe, expect, it, vi } from 'vitest';
import { allauthParams, createApi } from './client';
import { CSRF_COOKIE_NAME, CSRF_HEADER_NAME, readCookie } from './csrf';
import { isAppError } from './errors';
import { unwrap } from './unwrap';
import type { components as OpenComponents } from './generated/open';

const BASE = 'http://localhost';

const json = (status: number, body: unknown) =>
	new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' }
	});

const matchBody: OpenComponents['schemas']['MatchCreateIn'] = {
	format: 'singles',
	played_on: '2026-01-01',
	team_a: ['P-AAAA-AAAA'],
	team_b: ['P-BBBB-BBBB'],
	games: [{ team_a: 11, team_b: 7 }]
};

/** A cookie jar the stubbed `fetch` can write to when the CSRF endpoint is called. */
function setup(
	handler: (request: Request, jar: { token: string | null }) => Response | Promise<Response>
) {
	const jar = { token: null as string | null };
	const seen: Request[] = [];
	const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
		const request = input instanceof Request ? input : new Request(input, init);
		seen.push(request.clone());
		return handler(request, jar);
	});
	const api = createApi({
		baseUrl: BASE,
		fetch: fetchStub as unknown as typeof fetch,
		getCookies: () => (jar.token ? `other=1; ${CSRF_COOKIE_NAME}=${jar.token}` : 'other=1')
	});
	return { api, jar, seen, fetchStub };
}

describe('readCookie', () => {
	it('finds a cookie among several and decodes it', () => {
		expect(readCookie('a=1; csrftoken=abc%20d; b=2', 'csrftoken')).toBe('abc d');
		expect(readCookie('a=1', 'csrftoken')).toBeNull();
		expect(readCookie('xcsrftoken=1', 'csrftoken')).toBeNull();
	});
});

describe('CSRF middleware', () => {
	it('does not touch safe methods', async () => {
		const { api, seen } = setup(() => json(200, { email: 'a@example.test' }));
		await api.open.GET('/api/v1/accounts/me');
		expect(seen).toHaveLength(1);
		expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBeNull();
	});

	it('copies the cookie into X-CSRFToken on POST', async () => {
		const { api, jar, seen } = setup(() => json(201, {}));
		jar.token = 'tok-1';
		await api.open.POST('/api/v1/matches/', { body: matchBody });
		expect(seen).toHaveLength(1);
		expect(seen[0].method).toBe('POST');
		expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok-1');
		expect(await seen[0].json()).toMatchObject({ format: 'singles' });
	});

	it('copies the cookie on DELETE for the allauth client too', async () => {
		const { api, jar, seen } = setup(() =>
			json(401, { status: 401, data: { flows: [] }, meta: {} })
		);
		jar.token = 'tok-2';
		await api.allauth.DELETE('/_allauth/{client}/v1/auth/session', { params: allauthParams });
		expect(seen[0].url).toBe(`${BASE}/_allauth/browser/v1/auth/session`);
		expect(seen[0].headers.get(CSRF_HEADER_NAME)).toBe('tok-2');
	});

	it('fetches the cookie first when it is missing', async () => {
		const { api, jar, seen } = setup((request) => {
			if (request.url.endsWith('/_allauth/browser/v1/config')) {
				jar.token = 'fresh';
				return json(200, { status: 200, data: {} });
			}
			return json(201, {});
		});
		await api.open.POST('/api/v1/matches/', { body: matchBody });
		expect(seen.map((r) => new URL(r.url).pathname)).toEqual([
			'/_allauth/browser/v1/config',
			'/api/v1/matches/'
		]);
		expect(seen[1].headers.get(CSRF_HEADER_NAME)).toBe('fresh');
	});

	it('retries once after refreshing the token on a ninja CSRF 403', async () => {
		let posts = 0;
		const { api, jar, seen } = setup((request) => {
			if (request.url.endsWith('/_allauth/browser/v1/config')) {
				jar.token = 'new';
				return json(200, {});
			}
			posts += 1;
			return request.headers.get(CSRF_HEADER_NAME) === 'new'
				? json(201, { code: 'M-OK' })
				: json(403, { code: 'forbidden', message: 'CSRF check Failed', errors: [] });
		});
		jar.token = 'stale';
		const { data, error } = await api.open.POST('/api/v1/matches/', { body: matchBody });
		expect(error).toBeUndefined();
		expect(data).toEqual({ code: 'M-OK' });
		expect(posts).toBe(2);
		const retry = seen[seen.length - 1];
		expect(retry.headers.get(CSRF_HEADER_NAME)).toBe('new');
		expect(await retry.json()).toMatchObject({ format: 'singles' });
	});

	it('retries an allauth HTML CSRF 403', async () => {
		const { api, jar } = setup((request) => {
			if (request.url.endsWith('/config')) {
				jar.token = 'new';
				return json(200, {});
			}
			return request.headers.get(CSRF_HEADER_NAME) === 'new'
				? json(200, { status: 200 })
				: new Response('<html>403 Forbidden</html>', {
						status: 403,
						headers: { 'Content-Type': 'text/html' }
					});
		});
		jar.token = 'stale';
		const { response } = await api.allauth.POST('/_allauth/{client}/v1/auth/login', {
			params: allauthParams,
			body: { email: 'a@example.test', password: 'a-made-up-password' }
		});
		expect(response.status).toBe(200);
	});

	it('does not retry a second time', async () => {
		let posts = 0;
		const { api, jar } = setup((request) => {
			if (request.url.endsWith('/config')) return json(200, {});
			posts += 1;
			return json(403, { code: 'forbidden', message: 'CSRF check Failed', errors: [] });
		});
		jar.token = 'tok';
		const { response } = await api.open.POST('/api/v1/matches/', { body: matchBody });
		expect(response.status).toBe(403);
		expect(posts).toBe(2);
	});

	it('does not retry a permission 403', async () => {
		let posts = 0;
		const { api, jar } = setup(() => {
			posts += 1;
			return json(403, { code: 'forbidden', message: 'Not allowed.', errors: [] });
		});
		jar.token = 'tok';
		await api.open.POST('/api/v1/matches/', { body: matchBody });
		expect(posts).toBe(1);
	});

	it('shares one refresh between concurrent requests with no cookie', async () => {
		let configCalls = 0;
		const { api, jar } = setup(async (request) => {
			if (request.url.endsWith('/config')) {
				configCalls += 1;
				await new Promise((r) => setTimeout(r, 5));
				jar.token = 'fresh';
				return json(200, {});
			}
			return json(201, {});
		});
		await Promise.all([
			api.open.POST('/api/v1/matches/', { body: matchBody }),
			api.open.POST('/api/v1/matches/', { body: matchBody })
		]);
		expect(configCalls).toBe(1);
	});

	it('does not retry a CSRF 403 when the refresh yields no token', async () => {
		let posts = 0;
		const { api } = setup((request) => {
			if (request.url.endsWith('/config')) return json(200, {});
			posts += 1;
			return json(403, { code: 'forbidden', message: 'CSRF check Failed', errors: [] });
		});
		// The backend never sets a cookie, so there is no token to retry with.
		const pending = api.open.POST('/api/v1/matches/', { body: matchBody });
		const { response } = await pending;
		expect(response.status).toBe(403);
		expect(posts).toBe(1);
	});

	it('initCsrf asks the backend only when there is no cookie', async () => {
		const { api, jar, fetchStub } = setup((request) => {
			if (request.url.endsWith('/config')) jar.token = 'set';
			return json(200, {});
		});
		await api.initCsrf();
		expect(fetchStub).toHaveBeenCalledTimes(1);
		await api.initCsrf();
		expect(fetchStub).toHaveBeenCalledTimes(1);
	});
});

describe('unwrap', () => {
	it('returns data on success', async () => {
		const { api } = setup(() => json(200, { email: 'a@example.test' }));
		await expect(unwrap(api.open.GET('/api/v1/accounts/me'))).resolves.toEqual({
			email: 'a@example.test'
		});
	});

	it('throws an AppError for a ninja error', async () => {
		const { api } = setup(() =>
			json(401, { code: 'unauthorized', message: 'Authentication required.', errors: [] })
		);
		const failure = await unwrap(api.open.GET('/api/v1/accounts/me')).catch((e) => e);
		expect(isAppError(failure)).toBe(true);
		expect(failure).toMatchObject({ kind: 'unauthenticated', status: 401 });
	});

	it('throws a network AppError when fetch rejects', async () => {
		const { api } = setup(() => {
			throw new TypeError('Failed to fetch');
		});
		const failure = await unwrap(api.open.GET('/api/v1/accounts/me')).catch((e) => e);
		expect(failure).toMatchObject({ kind: 'network', status: null });
	});

	it('throws a server AppError for a non-JSON 500', async () => {
		const { api } = setup(
			() =>
				new Response('<html>oops</html>', { status: 500, headers: { 'Content-Type': 'text/html' } })
		);
		const failure = await unwrap(api.open.GET('/api/v1/accounts/me')).catch((e) => e);
		expect(failure).toMatchObject({ kind: 'server', status: 500 });
	});
});
