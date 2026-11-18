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

export type PlayerRatings = {
	singles: Rating | null;
	doubles: Rating | null;
	/** The backend says every number is a demonstration. */
	demonstration: boolean;
};
