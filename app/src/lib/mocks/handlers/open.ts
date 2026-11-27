import { http as anyHttp } from 'msw';
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
type EventCreateIn = components['schemas']['EventCreateIn'];
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
		// `config/auth.py`: an account that must have two-factor and has none, or has it and this
		// session did not pass it, gets 403 `mfa_required` on every operation. Any other request
		// falls through to its own handler.
		anyHttp.all('*/api/v1/*', () =>
			store.mfaRequiredNow()
				? ninjaError(403, 'mfa_required', 'Two-factor authentication is required.')
				: undefined
		),

		// `list_my_organizers`: the signed-in account's own memberships.
		http.get('/api/v1/organizer/organizers', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			return response(200).json(structuredClone(store.accountByEmail(email)?.organizers ?? []));
		}),

		// Only so the two-factor tests can show an organizer operation. The app has no Event
		// screens yet (frontend#217), so the mock keeps no Events.
		http.get('/api/v1/organizer/events', ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			return response(200).json({ items: [], count: 0 });
		}),

		// `create_organizer_event`: a verified organizer the account is a member of, and two-factor
		// on the account. Anything else is the same plain 403.
		http.post('/api/v1/organizer/events', async ({ request, cookies, response }) => {
			const email = guard(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const account = store.accountByEmail(email);
			const body = (await readJson(request)) as Partial<EventCreateIn> | undefined;
			const membership = account?.organizers?.find(
				(m) => m.verified && m.organizer === body?.organizer
			);
			if (!membership || !account?.totp) {
				return response.untyped(
					ninjaError(403, 'forbidden', 'You cannot create an Event for this organizer.')
				);
			}
			return response(201).json({
				code: 'E-MOCK-0001',
				organizer: membership.organizer,
				club: null,
				name: String(body?.name ?? ''),
				kind: body?.kind ?? 'tournament',
				start_date: String(body?.start_date ?? ''),
				end_date: String(body?.end_date ?? '')
			});
		}),

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

		http.post(
			'/api/v1/matches/{code}/correction',
			async ({ request, cookies, params, response }) => {
				const email = guard(request, cookies);
				if (typeof email !== 'string') return response.untyped(email);
				const code = normalizeCode(params.code, 'match');
				if (!code.ok) return response.untyped(notFound());
				const body = await readJson(request);
				const shape = matchCreateIssues(body);
				if (shape.length > 0) return response.untyped(validationError(shape));
				const result = store.correctMatch(
					email,
					code.value,
					body as components['schemas']['MatchCorrectionIn']
				);
				if (!result.ok) {
					if (result.kind === 'not_found') return response.untyped(notFound());
					if (result.kind === 'conflict') return response.untyped(stateConflict());
					if (result.kind === 'duplicate') return response.untyped(duplicateMatch(result.existing));
					return response.untyped(validationError(result.issues));
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
