/**
 * The organizer area: an organizer member's Events. The only file other code imports from this
 * feature.
 *
 * - `OrganizerEvents`: the `/organizer` page body. The route's `load` decides who gets the page
 *   (members only, through `organizerMemberships` from the auth feature).
 * - `PAGE_TITLE`: the page's title, "Events".
 * - `pageFromSearch`: `?page=` from the address, as on the Matches page.
 *
 * Display only: the backend decides who may manage an Event, and answers 403 or 404 otherwise.
 */
export { default as OrganizerEvents } from './components/organizer-events.svelte';
export { PAGE_TITLE } from './copy.js';
export { pageFromSearch } from '#lib/features/matches/index.js';
