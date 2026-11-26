import {
	needsViewerConfirmation,
	otherSide,
	waitingOnOtherTeam,
	type Match
} from '#lib/domain/index.js';
import type { HoldState } from './cache.svelte.js';

/** A button the status panel can offer. Each one maps to a match action on the match page. */
export type PanelAction = 'confirm' | 'dispute' | 'withdraw' | 'vouch' | 'correct';

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

/**
 * What a voided match may have become. `MatchOut` doesn't link a match to its correction, so
 * this can't say whether this one was corrected.
 */
export const VOIDED_CORRECTED =
	'If a player corrected this match, the corrected match is in your match history, with a new code.';

/**
 * Why a match is on hold. The API never names the other match, so neither does the copy. The
 * backend's hold email says the same.
 */
export const HOLD_WHY =
	"Another match on OPEN has the same teams and date as this one, but other scores. Both matches are on hold and don't count until each one is vouched for.";

/**
 * How a hold ends when no one settles it. The API gives no end date (the period is a backend
 * setting), so this promises none.
 */
export const HOLD_ENDS =
	'If no one settles the hold within a set time, the newer of the two matches is voided, as long as the older one is confirmed by then.';

/**
 * Who vouches, and what is left, for the side the viewer is on. A viewer with no team in the
 * match can only find it in the holds list as a member of the event's organizer.
 */
function vouchNote(match: Match, hold: HoldState): string {
	const organizer = match.viewerSide === null;
	if (hold.vouched) {
		return organizer
			? 'Your organizer has vouched for this match. The hold ends once the other match is vouched for too.'
			: 'Your team has vouched for this match. The hold ends once a player on the other team vouches too, and the other match is vouched for.';
	}
	return organizer
		? "If this is a separate match, not a repeat of the other one, vouch for it as a member of the event's organizer. You can't undo a vouch."
		: "If this is a separate match, not a repeat of the other one, vouch for it. One player from each team needs to vouch. You can't undo a vouch.";
}

/** The vouch button, while the viewer's side has not vouched. */
function vouchAction(hold: HoldState): PanelAction[] {
	return hold.vouched ? [] : ['vouch'];
}

/**
 * The status panel's copy for a held match. A disputed match keeps its dispute copy and adds the
 * hold. A pending or confirmed match reads "On hold" first, since it doesn't count either way.
 */
function heldCopy(match: Match, hold: HoldState): MatchStatusCopy {
	const base = statusCopy(match);
	if (match.status === 'disputed') {
		return {
			...base,
			notes: [
				...base.notes,
				'This match is also on hold. Another match on OPEN has the same teams and date, but other scores.',
				vouchNote(match, hold)
			],
			actions: [...base.actions, ...vouchAction(hold)]
		};
	}
	let line: string;
	if (match.status === 'confirmed') {
		line = 'The score is confirmed. The match counts once the hold ends.';
	} else if (needsViewerConfirmation(match)) {
		line =
			match.viewerDecision === 'withdraw'
				? "Your team hasn't confirmed the score yet. Confirm it if it's right. You withdrew your dispute, so you can't dispute this match again."
				: "Your team hasn't confirmed the score yet. Confirm it if it's right, or dispute it if it's wrong.";
	} else if (waitingOnOtherTeam(match)) {
		line = 'Your team confirmed the score. A player on the other team needs to confirm it too.';
	} else {
		line = 'The score also needs a player on each team to confirm it.';
	}
	return {
		title: 'On hold',
		text: HOLD_WHY,
		notes: [line, vouchNote(match, hold), HOLD_ENDS],
		actions: [...base.actions, ...vouchAction(hold)]
	};
}

/**
 * The status panel's copy for a match, from its status and the signed-in player's decision. Pass
 * `hold` when the holds list says the match is held: `MatchOut` itself can't say so.
 */
export function matchStatusCopy(match: Match, hold?: HoldState): MatchStatusCopy {
	const copy = hold && match.status !== 'voided' ? heldCopy(match, hold) : statusCopy(match);
	return canCorrect(match) ? withCorrect(match, copy) : copy;
}

/** What a correction does, said where the panel offers one. */
export const CORRECT_NOTE =
	'To fix a wrong score, correct it. This match is then voided, and the corrected one counts once a player on the other team confirms it.';

/**
 * A disputed match may have an event, and `MatchOut` can't say so (backend#302), so the panel
 * offers a correction and says who changes an event match. The backend answers 404 for one.
 */
export const CORRECT_EVENT_NOTE =
	'Only the organizer can change a match an organizer recorded, such as one played at an event.';

/**
 * True when the signed-in player may try to correct the match (backend#267): it is pending or
 * disputed, they played in it, and every player in it has a code, since a correction names the
 * same players and the API gives no code for a private player. The backend also refuses a match
 * with an event or a club, which the app can't tell apart (backend#302). It decides (rule 6).
 */
export function canCorrect(match: Match): boolean {
	if (match.status !== 'pending' && match.status !== 'disputed') return false;
	if (!match.viewerSide) return false;
	return [...match.teamA.players, ...match.teamB.players].every((player) => player.code !== null);
}

function withCorrect(match: Match, copy: MatchStatusCopy): MatchStatusCopy {
	return {
		...copy,
		notes: [
			...copy.notes,
			match.status === 'disputed' ? `${CORRECT_NOTE} ${CORRECT_EVENT_NOTE}` : CORRECT_NOTE
		],
		actions: [...copy.actions, 'correct']
	};
}

function statusCopy(match: Match): MatchStatusCopy {
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
				notes: [VOIDED_CORRECTED],
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

/**
 * True when the status panel offers the player something to do, so it goes before the score. A
 * correction alone doesn't count: it is there for when the score is wrong, not a step the match
 * waits on.
 */
export function hasActions(match: Match, hold?: HoldState): boolean {
	return matchStatusCopy(match, hold).actions.some((action) => action !== 'correct');
}
