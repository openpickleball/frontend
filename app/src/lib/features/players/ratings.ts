import type { PlayerRatingsOut, RatingOut } from '#lib/api/provisional.js';
import type { PlayerRatings, Rating } from './types.js';

function toRating(dto: RatingOut | undefined): Rating | null {
	if (!dto) return null;
	return {
		value: dto.rating,
		reliability: dto.reliability,
		provisional: dto.provisional,
		updatedAt: dto.updated_at
	};
}

export function toPlayerRatings(dto: PlayerRatingsOut): PlayerRatings {
	return {
		singles: toRating(dto.ratings.singles),
		doubles: toRating(dto.ratings.doubles),
		demonstration: dto.demonstration
	};
}

/** Whether `PUBLIC_API_MOCK` is a mode that serves sample ratings (`missing` or `all`). */
export function isSampleMode(mode: string): boolean {
	return mode === 'missing' || mode === 'all';
}

/** Ratings to two decimals. */
export function formatRating(value: number): string {
	return value.toFixed(2);
}
