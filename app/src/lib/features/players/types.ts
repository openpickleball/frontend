import type { OpenComponents } from '#lib/api/index.js';
import type { PlayerCode } from '#lib/domain/index.js';

/** The signed-in account's own player, from `GET me/player` (backend#124). */
export type MyPlayer = {
	code: PlayerCode;
	displayName: string;
};

/** One format's rating as the app shows it. */
export type Rating = {
	value: number;
	/** 0 to 1: how much play it rests on. */
	reliability: number;
	/** True while there is too little play for a settled number. */
	provisional: boolean;
	/** ISO 8601 timestamp. */
	updatedAt: string;
};

/** Who may see a profile detail: other signed-in players, or only the player. The backend's `Visibility`. */
export type Visibility = OpenComponents['schemas']['Visibility'];

/**
 * The profile details that have a privacy setting. The display name has none. `home_club` stays
 * while `PrivacyOut` still has `home_club_visibility`.
 */
export type PrivacyKey = 'match_history' | 'stats' | 'rating_history' | 'home_club' | 'city_region';

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

export type PlayerRatings = {
	singles: Rating | null;
	doubles: Rating | null;
	/** The backend says every number is a demonstration. */
	demonstration: boolean;
};
