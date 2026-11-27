import { MFA_REQUIRED, isAppError } from '#lib/api/index.js';
import type { MatchAction } from './cache.svelte.js';

/** What a player reads when a match action fails. */
const FAILED: Record<MatchAction, string> = {
	confirm: "We couldn't confirm the score. Try again.",
	dispute: "We couldn't dispute the score. Try again.",
	withdraw: "We couldn't withdraw your dispute. Try again.",
	vouch: "We couldn't vouch for this match. Try again."
};

export function actionProblem(cause: unknown, action: MatchAction): string {
	if (isAppError(cause)) {
		// The account needs two-factor, or this session has not passed it: say that, not a refusal.
		if (cause.code === MFA_REQUIRED) return cause.message;
		if (cause.kind === 'conflict') {
			if (action === 'vouch') {
				return "This match isn't on hold any more, or it was voided. There's nothing to vouch for now. Here is where it stands.";
			}
			return action === 'withdraw'
				? "There's no dispute of yours to withdraw on this match now. It may have been settled, or the match was voided. Check where it stands."
				: "This match can't be changed any more. Check where it stands, then try again.";
		}
		if (cause.kind === 'not_found' || cause.kind === 'forbidden') {
			if (action === 'vouch') {
				return "You can't vouch for this match. For a match with no event, a player from each team vouches. For an event match, the event's organizer does.";
			}
			return action === 'withdraw'
				? 'You can only withdraw a dispute on a match you played in.'
				: 'You can only confirm or dispute a match you played in.';
		}
		return cause.message;
	}
	return FAILED[action];
}
