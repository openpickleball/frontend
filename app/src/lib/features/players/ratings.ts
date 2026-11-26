import type { OpenComponents } from '#lib/api/index.js';
import type { PlayerRatings, Rating, RatingFormat } from './types.js';

type PlayerRatingsOut = OpenComponents['schemas']['PlayerRatingsOut'];
type RatingOut = OpenComponents['schemas']['RatingOut'];

/** Each format's name, in the order the profile lists them. */
export const FORMAT_LABELS: Readonly<Record<RatingFormat, string>> = {
	doubles: 'Doubles',
	mixed_doubles: 'Mixed doubles',
	doubles_women: "Women's doubles",
	doubles_men: "Men's doubles",
	singles: 'Singles'
};

const ORDER = Object.keys(FORMAT_LABELS) as RatingFormat[];

function toRating(format: RatingFormat, dto: RatingOut): Rating {
	return {
		format,
		value: dto.rating,
		reliability: dto.reliability,
		importedReliability: dto.imported_reliability,
		established: dto.established,
		provisional: dto.provisional,
		demonstration: dto.demonstration,
		updatedAt: dto.updated_at
	};
}

/** The ratings the backend sent, in the profile's order. A format the app doesn't know is left out. */
export function toPlayerRatings(dto: PlayerRatingsOut): PlayerRatings {
	const ratings: Rating[] = [];
	for (const format of ORDER) {
		const entry = dto.ratings[format];
		if (entry) ratings.push(toRating(format, entry));
	}
	return { ratings, demonstration: dto.demonstration };
}

/**
 * The rating to show first: the one with the highest reliability, so the big number is the
 * steadier one. A tie keeps the format order. It only compares what the backend sent.
 */
export function headlineRating(ratings: readonly Rating[]): Rating | null {
	let best: Rating | null = null;
	for (const rating of ratings) if (!best || rating.reliability > best.reliability) best = rating;
	return best;
}

/** Ratings to two decimals. */
export function formatRating(value: number): string {
	return value.toFixed(2);
}

/** A reliability, 0 to 100, as a whole number. */
export function formatReliability(value: number): string {
	return `${Math.round(value)} out of 100`;
}
