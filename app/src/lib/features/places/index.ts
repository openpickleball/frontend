/**
 * City suggestions for the sign-up form. The only file other code imports from this feature.
 *
 * - `PlaceSearch`: a runes class. Call `query(text)` on each keystroke, read `status`,
 *   `items` and `message`, and call `clear()` when a suggestion is picked or the field is cleared.
 * - `searchPlaces`, `PlacesError`, `PHOTON_URL`: the Photon call, for tests and mocks.
 */
export { PHOTON_URL, PlacesError, searchPlaces, type Place } from './photon.js';
export { PLACE_SEARCH_DELAY, PlaceSearch, type PlaceSearchStatus } from './place-search.svelte.js';
