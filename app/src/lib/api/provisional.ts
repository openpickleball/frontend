/**
 * Hand-written API types for endpoints the backend does not have yet.
 *
 * DELETE THIS FILE when the backend ships these endpoints and the schema snapshot
 * is regenerated (`pnpm api:pull && pnpm api:gen`). Tracked in frontend#35. The
 * shapes below are a best guess and will change; use the generated types after that.
 *
 * - Player profile, `GET/POST/PATCH /api/v1/me/player` and `GET /api/v1/players/{code}`:
 *   openpickleball/backend#124. The issue gives no response shape. This follows the
 *   backend's `Player` and `PlayerPrivacy` models (`apps/players/models.py`) and asks
 *   for the player's code on `GET /me/player`, as the frontend note on that issue does.
 * - Ratings, `GET /api/v1/players/{code}/ratings`: openpickleball/backend#53. The
 *   per-format entry is the shape the frontend proposed on that issue. The issue also
 *   lists the spec version and the public profile URL; they are optional here until
 *   their field names are confirmed.
 *
 * The `paths` interface has the same layout openapi-typescript generates, so
 * `openapi-fetch` and `openapi-msw` take it as they take the generated ones.
 * Error bodies are the backend's `ErrorResponse`.
 */
import type { components as OpenComponents } from './generated/open';

type ErrorResponse = OpenComponents['schemas']['ErrorResponse'];

/** Who may see a profile detail. The backend's `Visibility`. */
export type Visibility = 'signed_in' | 'private';

/** The backend's `PlayerPrivacy` settings. Current ratings and the display name have none. */
export type PrivacySettings = {
	city_region_visibility: Visibility;
	match_history_visibility: Visibility;
	rating_history_visibility: Visibility;
	stats_visibility: Visibility;
	home_club_visibility: Visibility;
};

/** The signed-in account's own player: `GET` and `PATCH /api/v1/me/player`. */
export type MyPlayerOut = {
	/** The OPEN code, such as `P-4RWN-8TQ2`. */
	code: string;
	display_name: string;
	home_club: string | null;
	privacy: PrivacySettings;
};

/** `POST /api/v1/me/player`. A signed-in account with a verified email may create one player. */
export type MyPlayerCreateIn = {
	display_name: string;
	home_club?: string | null;
};

/** `PATCH /api/v1/me/player`. Send only what changes. */
export type MyPlayerUpdateIn = {
	display_name?: string;
	home_club?: string | null;
	privacy?: Partial<PrivacySettings>;
};

/** `GET /api/v1/players/{code}`: the public profile. Hidden profiles are a 404, like an unknown code. */
export type PlayerProfileOut = {
	code: string;
	display_name: string;
	home_club: string | null;
};

/** The rating formats the app shows. The backend may add more. */
export type RatingFormat = 'singles' | 'doubles';

/** One format's rating. */
export type RatingOut = {
	rating: number;
	/** 0 to 1: how much play the rating rests on. */
	reliability: number;
	/** True while there is too little play for a settled rating. */
	provisional: boolean;
	/** ISO 8601 timestamp. */
	updated_at: string;
};

/** `GET /api/v1/players/{code}/ratings`. Public, no sign-in. */
export type PlayerRatingsOut = {
	ratings: Partial<Record<RatingFormat, RatingOut>>;
	/**
	 * True while the engine is a demonstration package. Every rating is then a
	 * demonstration rating, and the app must say so.
	 */
	demonstration: boolean;
	spec_version?: string;
	profile_url?: string;
};

type Json<T> = { headers: { [name: string]: unknown }; content: { 'application/json': T } };
type Failure = Json<ErrorResponse>;
type NoParams = { query?: never; header?: never; path?: never; cookie?: never };
type CodePath = { query?: never; header?: never; path: { code: string }; cookie?: never };

export interface paths {
	'/api/v1/me/player': {
		parameters: NoParams;
		get: {
			parameters: NoParams;
			requestBody?: never;
			responses: { 200: Json<MyPlayerOut>; 401: Failure; 404: Failure };
		};
		put?: never;
		post: {
			parameters: NoParams;
			requestBody: { content: { 'application/json': MyPlayerCreateIn } };
			responses: { 201: Json<MyPlayerOut>; 401: Failure; 403: Failure; 409: Failure; 422: Failure };
		};
		delete?: never;
		options?: never;
		head?: never;
		patch: {
			parameters: NoParams;
			requestBody: { content: { 'application/json': MyPlayerUpdateIn } };
			responses: { 200: Json<MyPlayerOut>; 401: Failure; 403: Failure; 404: Failure; 422: Failure };
		};
		trace?: never;
	};
	'/api/v1/players/{code}': {
		parameters: CodePath;
		get: {
			parameters: CodePath;
			requestBody?: never;
			responses: { 200: Json<PlayerProfileOut>; 404: Failure };
		};
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
	'/api/v1/players/{code}/ratings': {
		parameters: CodePath;
		get: {
			parameters: CodePath;
			requestBody?: never;
			responses: { 200: Json<PlayerRatingsOut>; 404: Failure; 429: Failure };
		};
		put?: never;
		post?: never;
		delete?: never;
		options?: never;
		head?: never;
		patch?: never;
		trace?: never;
	};
}
