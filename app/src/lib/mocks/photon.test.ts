import { describe, expect, it } from 'vitest';
// eslint-disable-next-line boundaries/dependencies -- only to prove the mock repeats the real address
import { PHOTON_URL } from '../features/places';
import { PHOTON_MOCK_URL } from './handlers/photon';
import { useMockApi } from './node';

useMockApi();

async function search(q: string, limit?: number) {
	const url = new URL(PHOTON_URL);
	url.searchParams.set('q', q);
	if (limit) url.searchParams.set('limit', String(limit));
	const response = await fetch(url);
	const json = (await response.json()) as {
		type: string;
		features: { properties: Record<string, string> }[];
	};
	expect(json.type).toBe('FeatureCollection');
	return json.features.map((f) => f.properties);
}

describe('Photon place search mock', () => {
	it('is registered at the same address the places feature calls', () => {
		expect(PHOTON_MOCK_URL).toBe(PHOTON_URL);
	});

	it('filters by a case-insensitive prefix on the name', async () => {
		const found = await search('riverB');
		expect(found.map((p) => `${p.name}, ${p.state}`)).toEqual([
			'Riverbend, Ohio',
			'Riverbend, Oregon'
		]);
		expect(found[0]).toMatchObject({ osm_key: 'place', type: 'city', country: 'United States' });
	});

	it('does not match the middle of a name', async () => {
		expect(await search('bend')).toEqual([]);
	});

	it('honors the limit', async () => {
		expect(await search('', 2)).toHaveLength(2);
		expect(await search('Riverbend', 1)).toHaveLength(1);
	});

	it('gives a place with no state', async () => {
		const [place] = await search('Harbor');
		expect(place).toMatchObject({ name: 'Harbor Point', country: 'Iceland' });
		expect(place.state).toBeUndefined();
	});
});
