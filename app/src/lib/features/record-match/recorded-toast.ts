import type { SubmitResult } from './service.js';

/**
 * The toast to show once a match is saved. When the match exists but the player's own
 * confirmation failed, it says so and points at the match page, where they can redo it.
 */
export function recordedToast(result: SubmitResult): { title: string; description?: string } {
	if (result.confirmError) {
		return {
			title: "Match recorded. We couldn't confirm your score.",
			description: 'Confirm it on the match page.'
		};
	}
	return { title: 'Match recorded' };
}
