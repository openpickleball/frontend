import { normalizeCode } from '../../domain/codes';
import type { components } from '../../api/generated/open';
import { csrfValid, openHttp as http, readJson } from '../http';
import { createSchemaIssues, updateSchemaIssues } from '../player-rules';
import {
	cannotSubmit,
	csrfFailed,
	duplicateMatch,
	ninjaError,
	notFound,
	stateConflict,
	unauthorized,
	validationError
} from '../responses';
import type { MockStore } from '../store';

type PlayerCreateIn = components['schemas']['PlayerCreateIn'];
type PlayerUpdateIn = components['schemas']['PlayerUpdateIn'];
import { matchCreateIssues, pageQuery } from '../validation';

/**
 * The OPEN API. Every operation uses `account_auth`: no session is a 401 (before
 * anything else), then an unsafe method needs a valid CSRF token (403), as in
 * `config/auth.py`. The body schema comes next (422), then the view.
 *
 * `GET /api/v1/players/{code}` would also match `/api/v1/players/search`, so `createHandlers`
 * puts the search handlers first.
 */
export function createOpenHandlers(store: MockStore) {
	function guard(request: Request, cookies: Record<string, string | undefined>): Response | string {
		const account = store.currentAccount();
		if (!account) return unauthorized();
		if (!csrfValid(request, cookies, store)) return csrfFailed();
		return account.email;
	}

	function change(action: 'confirm' | 'dispute') {
		const path = `/api/v1/matches/{code}/${action}` as const;
		const handler = ({
			request,
			cookies,
			params,
			response
		}: Parameters<Parameters<typeof http.post<typeof path>>[1]>[0]) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'match');
			if (!code.ok) return response.untyped(notFound());
			const result = store.changeMatch(email, code.value, action);
			if (!result.ok) {
				return response.untyped(result.kind === 'conflict' ? stateConflict() : notFound());
			}
			return response(200).json(store.matchOut(result.match, email));
		};
		return http.post(path, handler);
	}

	return [
		http.get('/api/v1/accounts/me', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			return response(200).json({ email });
		}),

		http.post('/api/v1/matches/', async ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const body = await readJson(request);
			const shape = matchCreateIssues(body);
			if (shape.length > 0) return response.untyped(validationError(shape));
			const result = store.submitMatch(email, body as components['schemas']['MatchCreateIn']);
			if (!result.ok) {
				if (result.kind === 'forbidden') return response.untyped(cannotSubmit());
				if (result.kind === 'duplicate') return response.untyped(duplicateMatch(result.existing));
				return response.untyped(validationError(result.issues));
			}
			return response(201).json(store.matchOut(result.match, email));
		}),

		// Only the match's players can read it. Anyone else, and any unknown or malformed code,
		// gets the same 404.
		http.get('/api/v1/matches/{code}', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'match');
			if (!code.ok) return response.untyped(notFound());
			const match = store.matchForParticipant(email, code.value);
			if (!match) return response.untyped(notFound());
			return response(200).json(store.matchOut(match, email));
		}),

		change('confirm'),
		change('dispute'),

		http.post(
			'/api/v1/matches/{code}/withdraw-dispute',
			({ request, cookies, params, response }) => {
				const email = guard(request, cookies);
				if (typeof email !== 'string') return response.untyped(email);
				const code = normalizeCode(params.code, 'match');
				if (!code.ok) return response.untyped(notFound());
				const result = store.withdrawDispute(email, code.value);
				if (!result.ok) {
					return response.untyped(result.kind === 'conflict' ? stateConflict() : notFound());
				}
				return response(200).json(store.matchOut(result.match, email));
			}
		),

		http.post('/api/v1/matches/{code}/vouch', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'match');
			if (!code.ok) return response.untyped(notFound());
			const result = store.vouch(email, code.value);
			if (!result.ok) {
				return response.untyped(result.kind === 'conflict' ? stateConflict() : notFound());
			}
			return response(200).json(store.matchOut(result.match, email));
		}),

		http.get('/api/v1/me/matches/holds', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const url = new URL(request.url);
			const page = pageQuery(url.searchParams.get('limit'), url.searchParams.get('offset'));
			if (!page.ok) return response.untyped(validationError(page.issues));
			const result = store.listMyHolds(email, page.value.limit, page.value.offset);
			return response(200).json({
				items: result.items.map(({ match, vouched }) => ({
					match: store.matchOut(match, email),
					vouched
				})),
				count: result.count
			});
		}),

		http.get('/api/v1/me/matches/disputes', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const url = new URL(request.url);
			const page = pageQuery(url.searchParams.get('limit'), url.searchParams.get('offset'));
			if (!page.ok) return response.untyped(validationError(page.issues));
			const result = store.listMyDisputes(email, page.value.limit, page.value.offset);
			return response(200).json({
				items: result.items.map((match) => store.matchOut(match, email)),
				count: result.count
			});
		}),

		http.get('/api/v1/me/matches/awaiting-confirmation', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const url = new URL(request.url);
			const page = pageQuery(url.searchParams.get('limit'), url.searchParams.get('offset'));
			if (!page.ok) return response.untyped(validationError(page.issues));
			const result = store.listAwaitingConfirmation(email, page.value.limit, page.value.offset);
			return response(200).json({
				items: result.items.map((match) => store.matchOut(match, email)),
				count: result.count
			});
		}),

		http.get('/api/v1/players/{code}/matches', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const url = new URL(request.url);
			const page = pageQuery(url.searchParams.get('limit'), url.searchParams.get('offset'));
			if (!page.ok) return response.untyped(validationError(page.issues));
			const result = store.listPlayerMatches(
				email,
				code.value,
				page.value.limit,
				page.value.offset
			);
			if (!result.ok) return response.untyped(notFound());
			return response(200).json({
				items: result.items.map((match) => store.matchOut(match, email)),
				count: result.count
			});
		}),

		http.get('/api/v1/me/player', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const player = store.playerOfAccount(email);
			if (!player) return response.untyped(notFound());
			return response(200).json(store.myPlayerOut(player));
		}),

		http.post('/api/v1/me/player', async ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const body = await readJson(request);
			const shape = createSchemaIssues(body);
			if (shape.length > 0) return response.untyped(validationError(shape));
			const result = store.createMyPlayer(email, body as PlayerCreateIn);
			if (!result.ok) {
				if (result.kind === 'unverified') {
					return response.untyped(
						ninjaError(403, 'forbidden', 'Verify your email address before creating your player.')
					);
				}
				return response.untyped(
					result.kind === 'conflict'
						? ninjaError(409, 'conflict', 'This account already has a player.')
						: validationError(result.issues)
				);
			}
			return response(201).json(store.myPlayerOut(result.player));
		}),

		http.patch('/api/v1/me/player', async ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const body = await readJson(request);
			const shape = updateSchemaIssues(body);
			if (shape.length > 0) return response.untyped(validationError(shape));
			const player = store.playerOfAccount(email);
			if (!player) return response.untyped(notFound());
			const issues = store.updateMyPlayer(player, body as PlayerUpdateIn);
			if (issues.length > 0) return response.untyped(validationError(issues));
			return response(200).json(store.myPlayerOut(player));
		}),

		// A hidden (inactive) player gets the same 404 as an unknown or malformed code.
		http.get('/api/v1/players/{code}', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const profile = store.publicProfile(code.value, email);
			if (!profile) return response.untyped(notFound());
			return response(200).json(profile);
		}),

		// `get_player_ratings`: an unknown or malformed code, an inactive account and ratings the
		// player keeps private all get the same 404.
		http.get('/api/v1/players/{code}/ratings', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const ratings = store.ratingsFor(code.value, email);
			if (!ratings) return response.untyped(notFound());
			return response(200).json(ratings);
		}),

		// `list_player_rating_history`: an unknown or malformed code, an inactive account and
		// history the player keeps private all get the same 404. Paged with `limit` and `offset`.
		http.get('/api/v1/players/{code}/rating-history', ({ request, cookies, params, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const url = new URL(request.url);
			const page = pageQuery(url.searchParams.get('limit'), url.searchParams.get('offset'));
			if (!page.ok) return response.untyped(validationError(page.issues));
			const history = store.ratingHistoryFor(
				code.value,
				email,
				page.value.limit,
				page.value.offset
			);
			if (!history) return response.untyped(notFound());
			return response(200).json(history);
		})
	];
}
