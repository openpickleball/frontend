import {
	needsViewerConfirmation,
	otherSide,
	waitingOnOtherTeam,
	type Match
} from '#lib/domain/index.js';

/** A button the status panel can offer. Each one maps to a match action on the match page. */
export type PanelAction = 'confirm' | 'dispute' | 'withdraw';

/**
 * What the status panel says about a match and what it offers. `text` is the main line, `notes`
 * are the paragraphs under it, and `actions` are the buttons, in order. The panel and the match
 * page both read this, so a new status or action only needs a case here and a button there.
 */
export type MatchStatusCopy = {
	title: string;
	text: string;
	notes: string[];
	actions: PanelAction[];
};

/**
 * How a dispute ends. The API gives no end date (the period is a backend setting), so this
 * promises none. It doesn't know whether the match has an event either, so it says both ways.
 */
export const DISPUTE_ENDS =
	"A dispute ends when every player who disputed the score withdraws. For a match played at an event, the event's organizer can settle it too. If no one settles it within a set time, the match is voided and doesn't count.";

/** The status panel's copy for a match, from its status and the signed-in player's decision. */
export function matchStatusCopy(match: Match): MatchStatusCopy {
	const decision = match.viewerDecision;
	switch (match.status) {
		case 'confirmed':
			return {
				title: 'Confirmed',
				text:
					decision === 'confirm'
						? 'You confirmed this score. It counts in your match history.'
						: 'This score is confirmed. It counts in your match history.',
				notes: [],
				actions: []
			};
		case 'disputed':
			if (decision === 'dispute') {
				return {
					title: 'Disputed',
					text: 'You said this score is wrong. No one can confirm it while it is disputed.',
					notes: [
						DISPUTE_ENDS,
						"If the score is right after all, withdraw your dispute. You can't dispute this match again after that."
					],
					// The backend refuses a withdraw from anyone else with no open dispute (409).
					actions: match.viewerSide ? ['withdraw'] : []
				};
			}
			return {
				title: 'Disputed',
				text:
					decision === 'withdraw'
						? 'You withdrew your dispute. Another player in this match still says the score is wrong. No one can confirm it while it is disputed.'
						: 'A player in this match said the score is wrong. No one can confirm it while it is disputed.',
				notes: [DISPUTE_ENDS],
				actions: []
			};
		case 'voided':
			return {
				title: 'Voided',
				text: "This match was voided. It doesn't count towards anyone's history.",
				notes: [],
				actions: []
			};
		default:
			break;
	}
	const confirmed = match.confirmedBySide;
	if (!match.viewerSide || !confirmed) {
		return {
			title: 'Waiting for confirmation',
			text: 'This match counts once a player on each team confirms the score.',
			notes: [],
			actions: []
		};
	}
	if (needsViewerConfirmation(match)) {
		const otherConfirmed = confirmed[otherSide(match.viewerSide)];
		// A withdrawn dispute is still the player's one dispute: disputing again changes nothing.
		const withdrawn = decision === 'withdraw';
		return {
			title: 'Is this the right score?',
			text: `${
				otherConfirmed
					? 'The other team has confirmed this score. Your team has not.'
					: 'Neither team has confirmed this score yet.'
			} The match counts once a player on each team confirms it. ${
				withdrawn
					? "You withdrew your dispute, so you can't dispute this match again."
					: 'If the score is wrong, dispute it.'
			}`,
			notes: [],
			actions: withdrawn ? ['confirm'] : ['confirm', 'dispute']
		};
	}
	if (!waitingOnOtherTeam(match)) {
		return {
			title: 'Waiting for confirmation',
			text: 'This match counts once a player on each team confirms the score.',
			notes: [],
			actions: []
		};
	}
	return {
		title: 'Waiting for the other team',
		text: `${
			decision === 'confirm'
				? 'You confirmed this score.'
				: 'A player on your team confirmed this score.'
		} The match counts once a player on the other team confirms it too.`,
		notes: [],
		actions: []
	};
}

/** True when the status panel offers the player something to do, so it goes before the score. */
export function hasActions(match: Match): boolean {
	return matchStatusCopy(match).actions.length > 0;
}
