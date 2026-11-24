import { http, HttpResponse } from 'msw';

/**
 * The Photon geocoder's search address. It repeats `PHOTON_URL` from `features/places`, which
 * the mocks may not import. `photon.test.ts` checks that the two are equal.
 */
export const PHOTON_MOCK_URL = 'https://photon.komoot.io/api/';

type MockPlace = { name: string; state?: string; country: string };

/** Made-up places only. Two share a name, and one has no state. */
const PLACES: MockPlace[] = [
	{ name: 'Riverbend', state: 'Ohio', country: 'United States' },
	{ name: 'Riverbend', state: 'Oregon', country: 'United States' },
	{ name: 'Maple Hollow', state: 'Ontario', country: 'Canada' },
	{ name: 'Lakeport Shores', state: 'Victoria', country: 'Australia' },
	{ name: 'Harbor Point', country: 'Iceland' }
];

const DEFAULT_LIMIT = 15;

/** Photon's GeoJSON answer for a city search: a prefix match on the name, up to `limit`. */
export function createPhotonHandlers() {
	return [
		http.get(PHOTON_MOCK_URL, ({ request }) => {
			const params = new URL(request.url).searchParams;
			const query = (params.get('q') ?? '').trim().toLowerCase();
			const limit = Number(params.get('limit')) || DEFAULT_LIMIT;
			const features = PLACES.filter((place) => place.name.toLowerCase().startsWith(query))
				.slice(0, limit)
				.map((place, index) => ({
					type: 'Feature',
					geometry: { type: 'Point', coordinates: [0, index] },
					properties: { ...place, osm_key: 'place', type: 'city' }
				}));
			return HttpResponse.json({ type: 'FeatureCollection', features });
		})
	];
}
