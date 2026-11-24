import { describe, expect, it, vi } from 'vitest';
import { PHOTON_URL, PlacesError, searchPlaces } from './photon';

const MESSAGE = "We couldn't load suggestions. Try again.";

type Props = { name?: unknown; state?: string; country?: string };

function collection(...properties: Props[]) {
	return { type: 'FeatureCollection', features: properties.map((p) => ({ properties: p })) };
}

function stub(body: unknown, init: ResponseInit = {}) {
	return vi.fn<typeof globalThis.fetch>(async () => Response.json(body, init));
}

describe('searchPlaces', () => {
	it('asks Photon for five cities in English, with the trimmed text encoded', async () => {
		const fetch = stub(collection());
		await searchPlaces('  São Paulo ', { fetch });
		expect(PHOTON_URL).toBe('https://photon.komoot.io/api/');
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch.mock.calls[0][0]).toBe(
			'https://photon.komoot.io/api/?q=S%C3%A3o%20Paulo&limit=5&layer=city&lang=en'
		);
	});

	it('sends no headers or credentials, only the signal', async () => {
		const fetch = stub(collection());
		const controller = new AbortController();
		await searchPlaces('Aus', { fetch, signal: controller.signal });
		expect(fetch.mock.calls[0][1]).toEqual({ signal: controller.signal });
	});

	it('reads the city, region and country, and builds the label', async () => {
		const fetch = stub(collection({ name: 'Austin', state: 'Texas', country: 'United States' }));
		expect(await searchPlaces('Austin', { fetch })).toEqual([
			{
				city: 'Austin',
				region: 'Texas',
				country: 'United States',
				label: 'Austin, Texas, United States'
			}
		]);
	});

	it('leaves the region out of the label when there is none', async () => {
		const fetch = stub(collection({ name: 'Monaco', country: 'Monaco' }));
		expect(await searchPlaces('Mon', { fetch })).toEqual([
			{ city: 'Monaco', region: '', country: 'Monaco', label: 'Monaco, Monaco' }
		]);
	});

	it('drops places without a name', async () => {
		const fetch = stub(
			collection({ state: 'Texas' }, { name: '' }, { name: 5 }, { name: 'Austin', state: 'Texas' })
		);
		const places = await searchPlaces('Aus', { fetch });
		expect(places.map((p) => p.city)).toEqual(['Austin']);
	});

	it('drops a later place with the same label', async () => {
		const fetch = stub(
			collection(
				{ name: 'Springfield', state: 'Illinois', country: 'United States' },
				{ name: 'Springfield', state: 'Illinois', country: 'United States' },
				{ name: 'Springfield', state: 'Missouri', country: 'United States' }
			)
		);
		const places = await searchPlaces('Spring', { fetch });
		expect(places.map((p) => p.label)).toEqual([
			'Springfield, Illinois, United States',
			'Springfield, Missouri, United States'
		]);
	});

	it('gives an empty list when nothing matches', async () => {
		expect(await searchPlaces('zzzz', { fetch: stub(collection()) })).toEqual([]);
	});

	it('throws a PlacesError when the request fails', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw new TypeError('network down');
		});
		const error = await searchPlaces('Aus', { fetch }).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(PlacesError);
		expect((error as Error).message).toBe(MESSAGE);
	});

	it('throws a PlacesError on a non-2xx answer', async () => {
		const error = await searchPlaces('Aus', { fetch: stub({}, { status: 503 }) }).catch(
			(e: unknown) => e
		);
		expect(error).toBeInstanceOf(PlacesError);
		expect((error as Error).message).toBe(MESSAGE);
	});

	it('throws a PlacesError when the body is not JSON', async () => {
		const fetch = vi.fn<typeof globalThis.fetch>(
			async () => new Response('<html>', { status: 200 })
		);
		await expect(searchPlaces('Aus', { fetch })).rejects.toBeInstanceOf(PlacesError);
	});

	it('throws a PlacesError when the body has no features array', async () => {
		await expect(searchPlaces('Aus', { fetch: stub({ features: 'no' }) })).rejects.toBeInstanceOf(
			PlacesError
		);
		await expect(searchPlaces('Aus', { fetch: stub(null) })).rejects.toBeInstanceOf(PlacesError);
	});

	it('lets an abort through unchanged', async () => {
		const abort = new DOMException('Aborted', 'AbortError');
		const fetch = vi.fn<typeof globalThis.fetch>(async () => {
			throw abort;
		});
		await expect(searchPlaces('Aus', { fetch })).rejects.toBe(abort);
	});
});
