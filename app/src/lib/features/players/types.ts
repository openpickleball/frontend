import type { OpenComponents } from '#lib/api/index.js';
import type { PlayerCode } from '#lib/domain/index.js';

/** The signed-in account's own player, from `GET me/player` (backend#124). */
export type MyPlayer = {
	code: PlayerCode;
	displayName: string;
};

/** A rating pool, such as singles or mixed doubles. The backend's `RatingFormat`. */
export type RatingFormat = OpenComponents['schemas']['RatingFormat'];

/** One format's current rating, as the backend sent it. */
export type Rating = {
	format: RatingFormat;
	value: number;
	/** 0 to 100: the reliability earned in OPEN. */
	reliability: number;
	/** 0 to 100: the reliability carried from an external rating, or `null` when there is none. */
	importedReliability: number | null;
	/** False until the rating rests on enough matches to be established. */
	established: boolean;
	/** True while it holds updates a recount has not confirmed yet, so it can still change. */
	provisional: boolean;
	/** True while the rating engine is a demonstration package. */
	demonstration: boolean;
	/** ISO 8601 timestamp. */
	updatedAt: string;
};

/** Who may see a profile detail: other signed-in players, or only the player. The backend's `Visibility`. */
export type Visibility = OpenComponents['schemas']['Visibility'];

/**
 * The profile details that have a privacy setting. The display name has none. `home_club` stays
 * while `PrivacyOut` still has `home_club_visibility`. `rating` is `rating_visibility`: who sees
 * the current ratings. It has its own rules, so it is not a plain switch (`SwitchKey`).
 */
export type PrivacyKey =
	'match_history' | 'stats' | 'rating_history' | 'home_club' | 'city_region' | 'rating';

/** The settings a player can switch either way at any time. */
export type SwitchKey = Exclude<PrivacyKey, 'rating'>;

export type Privacy = Record<PrivacyKey, Visibility>;

/** What the player can change on their own profile, from `GET me/player` (backend#124). */
export type MySettings = {
	displayName: string;
	privacy: Privacy;
};

/** A change to send. Only what changes. */
export type MySettingsChange = {
	displayName?: string;
	privacy?: Partial<Privacy>;
};

/** A player's current ratings, one per format they have one in, in the profile's format order. */
export type PlayerRatings = {
	ratings: Rating[];
	/** The backend says every number is a demonstration. */
	demonstration: boolean;
};

/** What caused a change to a rating. The backend's `RatingChangeKind`. */
export type RatingChangeKind = OpenComponents['schemas']['RatingChangeKind'];

/** One change to a player's rating in one format, as the backend sent it. */
export type RatingChange = {
	format: RatingFormat;
	kind: RatingChangeKind;
	/** The rating after the change. For a `removed` change, the rating that was removed. */
	value: number;
	/** 0 to 100: the reliability earned in OPEN. */
	reliability: number;
	/** 0 to 100: the reliability carried from an external rating, or `null` when there is none. */
	importedReliability: number | null;
	established: boolean;
	provisional: boolean;
	demonstration: boolean;
	/** ISO 8601 timestamp: when the change was recorded. */
	recordedAt: string;
};

/** One page of a player's rating history, newest first. */
export type RatingHistoryPage = {
	items: RatingChange[];
	/** How many changes there are in all. */
	count: number;
};
