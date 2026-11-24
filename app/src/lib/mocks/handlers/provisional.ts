import type { PlayerRatingsOut } from '../../api/provisional';
import { normalizeCode } from '../../domain/codes';
import { provisionalHttp as http } from '../http';
import { notFound } from '../responses';
import type { MockStore } from '../store';

export type ProvisionalOptions = {
	/**
	 * For `missing` mode: the real backend owns the players, so a code the mock does not know
	 * gets sample ratings instead of a 404.
	 */
	standalone?: boolean;
};

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

/** The one endpoint the backend does not have yet: ratings (backend#53, frontend#35). Public. */
export function createProvisionalHandlers(store: MockStore, options: ProvisionalOptions = {}) {
	const standalone = options.standalone ?? false;

	return [
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
