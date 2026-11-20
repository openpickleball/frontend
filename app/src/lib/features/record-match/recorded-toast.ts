import type { SubmitResult } from './service.js';

/** The match exists, so give the player time to read what is still missing. */
export const LONG_TOAST_MS = 10_000;

/**
 * The toast to show once a match is saved. When the match exists but the player's own
 * confirmation failed, it says so and points at the match page, where they can redo it.
 */
export function recordedToast(result: SubmitResult): {
	title: string;
	description?: string;
	duration?: number;
} {
	if (result.confirmError) {
		return {
			title: "Match recorded. We couldn't confirm your score.",
			description: 'Confirm it on the match page.',
			duration: LONG_TOAST_MS
		};
	}
	return { title: 'Match recorded' };
}
