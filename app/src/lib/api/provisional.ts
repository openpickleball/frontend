/**
 * Hand-written API types for the one endpoint the backend does not have yet: ratings,
 * `GET /api/v1/players/{code}/ratings` (openpickleball/backend#53).
 *
 * DELETE THIS FILE when the backend ships it and the schema snapshot is regenerated
 * (`pnpm api:pull && pnpm api:gen`). Tracked in frontend#35. The per-format entry is the shape
 * the frontend proposed on backend#53. That issue also lists the spec version and the public
 * profile URL; they are optional here until their field names are confirmed.
 *
 * The `paths` interface has the same layout openapi-typescript generates, so
 * `openapi-fetch` and `openapi-msw` take it as they take the generated ones.
 * Error bodies are the backend's `ErrorResponse`.
 */
import type { components as OpenComponents } from './generated/open';

type ErrorResponse = OpenComponents['schemas']['ErrorResponse'];

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
type CodePath = { query?: never; header?: never; path: { code: string }; cookie?: never };

export interface paths {
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
