import type { OpenComponents } from '#lib/api/index.js';
import type {
	PlayerRatings,
	Rating,
	RatingChange,
	RatingChangeKind,
	RatingFormat,
	RatingHistoryPage
} from './types.js';

type PlayerRatingsOut = OpenComponents['schemas']['PlayerRatingsOut'];
type RatingOut = OpenComponents['schemas']['RatingOut'];
type PagedRatingHistoryItemOut = OpenComponents['schemas']['PagedRatingHistoryItemOut'];
type RatingHistoryItemOut = OpenComponents['schemas']['RatingHistoryItemOut'];

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
 * What the lines on a rating tile mean, for the Ratings info popover (frontend#285). The tiles
 * keep them short ("Early estimate.", "May still change."), so the longer meaning is here.
 */
export const RATING_TERMS = {
	reliability: {
		term: 'Reliability',
		text: 'How sure a rating is, from 0 to 100. It comes from your confirmed matches on OPEN.'
	},
	imported: {
		term: 'Reliability from an external rating',
		text: 'The reliability carried over from an external rating, from 0 to 100. It is shown apart from the reliability earned on OPEN.'
	},
	early: { term: 'Early estimate', text: "The rating doesn't rest on enough matches yet." },
	provisional: {
		term: 'May still change',
		text: 'The rating may change when ratings are next recounted.'
	}
} as const;

/** Ratings to two decimals. */
export function formatRating(value: number): string {
	return value.toFixed(2);
}

/** A reliability, 0 to 100, as a whole number. */
export function formatReliability(value: number): string {
	return `${Math.round(value)} out of 100`;
}

/** Rating history pages hold 5 changes. */
export const HISTORY_PAGE_SIZE = 5;

function isKnownFormat(format: string): format is RatingFormat {
	return Object.hasOwn(FORMAT_LABELS, format);
}

function toRatingChange(dto: RatingHistoryItemOut): RatingChange {
	return {
		format: dto.rating_format,
		kind: dto.kind,
		value: dto.rating,
		reliability: dto.reliability,
		importedReliability: dto.imported_reliability,
		established: dto.established,
		provisional: dto.provisional,
		demonstration: dto.demonstration,
		recordedAt: dto.recorded_at
	};
}

/**
 * One page of rating history, in the backend's order (newest first). A change in a format or of
 * a kind the app doesn't know is left out, and `count` stays the backend's total.
 */
export function toRatingHistoryPage(dto: PagedRatingHistoryItemOut): RatingHistoryPage {
	return {
		items: dto.items
			.filter((item) => isKnownFormat(item.rating_format) && Object.hasOwn(CHANGE_KINDS, item.kind))
			.map(toRatingChange),
		count: dto.count
	};
}

/**
 * What each kind of change means, in plain words. True to the backend (`apps/ratings`): a
 * confirmed match that counts updates the rating in its format (`live_update`). When a match is
 * changed, voided or recorded late, every match is counted again, and each rating that comes out
 * different gets an entry (`replay`). When that recount gives no rating in a format any more, the
 * entry holds the numbers that were removed (`removed`). No copy says "replay" or "engine".
 */
export const CHANGE_KINDS: Readonly<Record<RatingChangeKind, { title: string; text: string }>> = {
	live_update: {
		title: 'After a match',
		text: 'A confirmed match updated this rating.'
	},
	replay: {
		title: 'Recounted',
		text: 'All matches were counted again, for example after a match was changed or recorded late.'
	},
	removed: {
		title: 'Removed',
		text: 'All matches were counted again and this rating no longer applies. These are the numbers that were removed.'
	}
};

const RECORDED_FORMAT = new Intl.DateTimeFormat('en-GB', {
	day: 'numeric',
	month: 'short',
	year: 'numeric'
});

/** "17 Nov 2026", in the viewer's time zone. Falls back to the text it was given. */
export function formatRecordedAt(recordedAt: string): string {
	const date = new Date(recordedAt);
	return Number.isNaN(date.getTime()) ? recordedAt : RECORDED_FORMAT.format(date);
}

/** "1–5 of 12" for the page that starts at `offset` and shows `shown` changes. */
export function historyRangeLabel(offset: number, shown: number, count: number): string {
	if (shown === 0) return `0 of ${count}`;
	return `${offset + 1}–${offset + shown} of ${count}`;
}
