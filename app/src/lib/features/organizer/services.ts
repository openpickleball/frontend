/**
 * The organizer's Event operations (`/api/v1/organizer/events`) and the club grants an admin
 * reads for the club picker. Each throws an `AppError` when it fails.
 *
 * Display only: the backend decides who may manage an Event. A 403 on create, or a 404 on a
 * change or delete, may mean the account lost its membership or authority, so those read the
 * memberships again (`loadAccountState`) before they throw. A removed member then loses the area.
 */
import {
	api as appApi,
	isAppError,
	unwrap,
	type ApiOption,
	type OpenComponents
} from '#lib/api/index.js';
import {
	toOrganizerEvent,
	toOrganizerEventPage,
	type EventCreateBody,
	type OrganizerEvent,
	type OrganizerEventPage
} from '#lib/domain/index.js';
import { loadAccountState } from '#lib/features/auth/index.js';

/** How many Events one page shows, the API's default. */
export const EVENTS_PAGE_SIZE = 20;

/** The fields a change may send: only those that changed. Never null. */
export type EventChanges = OpenComponents['schemas']['EventUpdateIn'];

/** A club that allows the organizer to name it, as the club picker shows it. */
export type ClubGrant = { club: string; name: string; city: string; region: string };

/** Reads the memberships again when `error` is `status`, then throws it. */
async function refreshOn(status: number, error: unknown, options: ApiOption): Promise<never> {
	if (isAppError(error) && error.status === status) await loadAccountState(options);
	throw error;
}

/** One page of the account's Events, newest start date first, as the API orders them. */
export async function listOrganizerEvents(
	offset: number,
	{ limit = EVENTS_PAGE_SIZE, api = appApi }: ApiOption & { limit?: number } = {}
): Promise<OrganizerEventPage> {
	const page = await unwrap(
		api.open.GET('/api/v1/organizer/events', { params: { query: { limit, offset } } })
	);
	return toOrganizerEventPage(page);
}

export async function createOrganizerEvent(
	body: EventCreateBody,
	options: ApiOption = {}
): Promise<OrganizerEvent> {
	const { api = appApi } = options;
	try {
		return toOrganizerEvent(await unwrap(api.open.POST('/api/v1/organizer/events', { body })));
	} catch (error) {
		return refreshOn(403, error, options);
	}
}

export async function updateOrganizerEvent(
	code: string,
	changes: EventChanges,
	options: ApiOption = {}
): Promise<OrganizerEvent> {
	const { api = appApi } = options;
	try {
		const dto = await unwrap(
			api.open.PATCH('/api/v1/organizer/events/{code}', {
				params: { path: { code } },
				body: changes
			})
		);
		return toOrganizerEvent(dto);
	} catch (error) {
		return refreshOn(404, error, options);
	}
}

export async function deleteOrganizerEvent(code: string, options: ApiOption = {}): Promise<void> {
	const { api = appApi } = options;
	try {
		await unwrap(
			api.open.DELETE('/api/v1/organizer/events/{code}', { params: { path: { code } } })
		);
	} catch (error) {
		await refreshOn(404, error, options);
	}
}

/** The clubs that allow the organizer to name them. Only an admin with two-factor may read it. */
export async function listClubGrants(
	organizer: string,
	{ api = appApi }: ApiOption = {}
): Promise<ClubGrant[]> {
	const grants = await unwrap(
		api.open.GET('/api/v1/organizer/organizers/{code}/club-grants', {
			params: { path: { code: organizer } }
		})
	);
	return grants.map(({ club, name, city, region }) => ({ club, name, city, region }));
}
