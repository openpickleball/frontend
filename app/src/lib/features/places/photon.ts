/**
 * City suggestions from Photon (photon.komoot.io), an open geocoder built on OpenStreetMap.
 * The browser asks it directly, so only the text typed leaves this device. There is no
 * account, key or header, and the text is never logged here.
 */

/**
 * The Photon search endpoint. The mock handler, the PWA rules and the content security policy
 * (`src/csp.ts`, for `connect-src`) use it too.
 */
export const PHOTON_URL = 'https://photon.komoot.io/api/';

const MESSAGE = "We couldn't load suggestions. Try again.";

/** A search that could not finish (not an abort). The message is fit to show a player. */
export class PlacesError extends Error {
	constructor() {
		super(MESSAGE);
		this.name = 'PlacesError';
	}
}

/** A city a player can pick. `city` and `region` are what sign-up sends. */
export type Place = { city: string; region: string; country: string; label: string };

export type SearchPlacesOptions = {
	signal?: AbortSignal;
	fetch?: typeof globalThis.fetch;
};

function isAbort(cause: unknown): boolean {
	return cause instanceof DOMException && cause.name === 'AbortError';
}

function text(value: unknown): string {
	return typeof value === 'string' ? value.trim() : '';
}

/** Read the GeoJSON features into places. Nameless ones and repeated labels are dropped. */
function toPlaces(body: unknown): Place[] {
	const features = (body as { features?: unknown } | null)?.features;
	if (!Array.isArray(features)) throw new PlacesError();
	const seen = new Set<string>();
	const places: Place[] = [];
	for (const feature of features) {
		const properties = (feature as { properties?: Record<string, unknown> } | null)?.properties;
		const city = text(properties?.name);
		if (!city) continue;
		const region = text(properties?.state);
		const country = text(properties?.country);
		const label = [city, region, country].filter(Boolean).join(', ');
		if (seen.has(label)) continue;
		seen.add(label);
		places.push({ city, region, country, label });
	}
	return places;
}

/**
 * Search for cities matching `query`. Throws `PlacesError` when Photon can't be reached or
 * answers badly. An abort is rethrown as is, so callers can ignore it.
 */
export async function searchPlaces(
	query: string,
	{ signal, fetch = globalThis.fetch }: SearchPlacesOptions = {}
): Promise<Place[]> {
	const url = `${PHOTON_URL}?q=${encodeURIComponent(query.trim())}&limit=5&layer=city&lang=en`;
	let response: Response;
	try {
		response = await fetch(url, { signal });
	} catch (cause) {
		if (isAbort(cause)) throw cause;
		throw new PlacesError();
	}
	if (!response.ok) throw new PlacesError();
	let body: unknown;
	try {
		body = await response.json();
	} catch (cause) {
		if (isAbort(cause)) throw cause;
		throw new PlacesError();
	}
	return toPlaces(body);
}
