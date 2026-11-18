import type { MyPlayerCreateIn, MyPlayerUpdateIn, PlayerRatingsOut } from '../../api/provisional';
import { normalizeCode } from '../../domain/codes';
import { csrfValid, provisionalHttp as http, readJson, readObject } from '../http';
import { csrfFailed, ninjaError, notFound, unauthorized, validationError } from '../responses';
import type { FieldIssue, MockStore } from '../store';

/**
 * In `missing` mode the real backend owns sign-in, so the mock cannot know who is
 * signed in. These handlers then stand in for one account and ask for no session.
 */
export const STANDALONE_EMAIL = 'standalone@example.com';

export type ProvisionalOptions = {
	/** Serve without a session, for a real backend that has none of these endpoints. */
	standalone?: boolean;
};

const MAX_NAME = 64;

/** Deterministic sample ratings for any code, so a real backend's players have a card to show. */
function sampleRatings(code: string): PlayerRatingsOut {
	let hash = 0;
	for (const char of code) hash = (hash * 31 + char.charCodeAt(0)) % 997;
	return {
		ratings: {
			doubles: {
				rating: Math.round((2.5 + (hash % 200) / 100) * 100) / 100,
				reliability: 0.5,
				provisional: true,
				updated_at: '2026-11-17T09:00:00Z'
			}
		},
		demonstration: true
	};
}

function textIssues(
	input: Record<string, unknown>,
	{ requireName }: { requireName: boolean }
): FieldIssue[] {
	const issues: FieldIssue[] = [];
	const name = input.display_name;
	if (name === undefined) {
		if (requireName)
			issues.push({ field: 'body.display_name', code: 'missing', message: 'Field required' });
	} else if (typeof name !== 'string') {
		issues.push({
			field: 'body.display_name',
			code: 'string_type',
			message: 'Input should be a valid string'
		});
	} else if (name.trim() === '') {
		issues.push({ field: 'body.display_name', code: 'invalid', message: 'Enter a display name.' });
	} else if (name.trim().length > MAX_NAME) {
		issues.push({
			field: 'body.display_name',
			code: 'max_length',
			message: `Ensure this value has at most ${MAX_NAME} characters (it has ${name.trim().length}).`
		});
	}
	const club = input.home_club;
	if (club !== undefined && club !== null && typeof club !== 'string') {
		issues.push({
			field: 'body.home_club',
			code: 'string_type',
			message: 'Input should be a valid string'
		});
	}
	return issues;
}

export function createProvisionalHandlers(store: MockStore, options: ProvisionalOptions = {}) {
	const standalone = options.standalone ?? false;

	/** The acting account's email, or a ready response. */
	function actor(request: Request, cookies: Record<string, string | undefined>): string | Response {
		if (standalone) return STANDALONE_EMAIL;
		const account = store.currentAccount();
		if (!account) return unauthorized();
		if (!csrfValid(request, cookies, store)) return csrfFailed();
		return account.email;
	}

	return [
		http.get('/api/v1/me/player', ({ request, cookies, response }) => {
			const email = actor(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const player = store.playerOfAccount(email);
			if (!player) return response.untyped(notFound());
			return response(200).json(store.myPlayerOut(player));
		}),

		http.post('/api/v1/me/player', async ({ request, cookies, response }) => {
			const email = actor(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const body = readObject(await readJson(request));
			const issues = textIssues(body, { requireName: true });
			if (issues.length > 0) return response.untyped(validationError(issues));
			if (store.playerOfAccount(email)) {
				return response.untyped(ninjaError(409, 'conflict', 'This account already has a player.'));
			}
			const player = store.createMyPlayer(email, body as MyPlayerCreateIn);
			return response(201).json(store.myPlayerOut(player));
		}),

		http.patch('/api/v1/me/player', async ({ request, cookies, response }) => {
			const email = actor(request, cookies);
			if (typeof email !== 'string') return response.untyped(email);
			const body = readObject(await readJson(request));
			const issues = textIssues(body, { requireName: false });
			const privacy = body.privacy;
			if (privacy !== undefined) {
				for (const [key, value] of Object.entries(readObject(privacy))) {
					if (value !== 'signed_in' && value !== 'private') {
						issues.push({
							field: `body.privacy.${key}`,
							code: 'enum',
							message: "Input should be 'signed_in' or 'private'"
						});
					}
				}
			}
			if (issues.length > 0) return response.untyped(validationError(issues));
			const player = store.playerOfAccount(email);
			if (!player) return response.untyped(notFound());
			store.updateMyPlayer(player, body as MyPlayerUpdateIn);
			return response(200).json(store.myPlayerOut(player));
		}),

		http.get('/api/v1/players/{code}', ({ params, response }) => {
			const viewer = standalone ? STANDALONE_EMAIL : (store.currentAccount()?.email ?? null);
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const profile = store.publicProfile(code.value, viewer);
			if (profile) return response(200).json(profile);
			if (standalone && !store.playerByCode(code.value)) {
				return response(200).json({
					code: code.value,
					display_name: 'Sample Player',
					home_club: null
				});
			}
			return response.untyped(notFound());
		}),

		http.get('/api/v1/players/{code}/ratings', ({ params, response }) => {
			const code = normalizeCode(params.code, 'player');
			if (!code.ok) return response.untyped(notFound());
			const ratings = store.ratingsFor(code.value);
			if (ratings) return response(200).json(ratings);
			if (standalone && !store.playerByCode(code.value)) {
				return response(200).json(sampleRatings(code.value));
			}
			return response.untyped(notFound());
		})
	];
}
