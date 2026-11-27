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
 * What the status panel says about a match and what it offers: a title, one sentence and the
 * buttons, in order. Longer explanations go in info popovers (frontend#285), not here. The panel
 * and the match page both read this, so a new status or action only needs a case here and a
 * button there.
 */
export type MatchStatusCopy = {
	title: string;
	text: string;
	actions: PanelAction[];
};

// The explanations below left the status panel's sentence in frontend#286. The info popovers
// (frontend#285, `statusInfo` below) use DISPUTE_ENDS and HOLD_ENDS. plans/ux-cleanup/plan.md
// lists them all.

/**
 * How a dispute ends. The API gives no end date (the period is a backend setting), so this
 * promises none. `MatchOut` now sends the match's Event and Club (backend#302), but the app does
 * not read them yet, so this says both ways. frontend#264 will use them.
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

/** What a correction does. */
export const CORRECT_NOTE =
	'To fix a wrong score, correct it. This match is then voided, and the corrected one counts once a player on the other team confirms it.';

/**
 * A disputed match may have an event. `MatchOut` now sends the Event and Club (backend#302), but
 * the app does not read them yet, so the panel offers a correction and the correction page says
 * who changes an event match. The backend answers 404 for one. frontend#264 will use the fields.
 */
export const CORRECT_EVENT_NOTE =
	'Only the organizer can change a match an organizer recorded, such as one played at an event.';

/** The vouch button, while the viewer's side has not vouched. */
function vouchAction(hold: HoldState): PanelAction[] {
	return hold.vouched ? [] : ['vouch'];
}

/** The one sentence for a held match that is not disputed, from who has vouched. */
function holdLine(match: Match, hold: HoldState): string {
	if (!hold.vouched) {
		return "Another match has the same teams and date but other scores, so this one doesn't count yet.";
	}
	return match.viewerSide === null
		? 'Your organizer vouched for this match, and the hold ends once the other match is vouched for too.'
		: 'Your team vouched for this match, and the hold ends once the others vouch too.';
}

/**
 * The status panel's copy for a held match. A disputed match keeps its dispute title and says it
 * is on hold too. A pending or confirmed match reads "On hold" first, since it doesn't count
 * either way. The buttons still offer what the match itself needs, such as Confirm.
 */
function heldCopy(match: Match, hold: HoldState): MatchStatusCopy {
	const base = statusCopy(match);
	if (match.status === 'disputed') {
		return {
			...base,
			text:
				match.viewerDecision === 'dispute'
					? 'You said this score is wrong, and the match is also on hold.'
					: match.viewerDecision === 'withdraw'
						? 'Another player still says this score is wrong, and the match is also on hold.'
						: 'A player said this score is wrong, and the match is also on hold.',
			actions: [...base.actions, ...vouchAction(hold)]
		};
	}
	return {
		title: 'On hold',
		text: holdLine(match, hold),
		actions: [...base.actions, ...vouchAction(hold)]
	};
}

/**
 * The status panel's copy for a match, from its status and the signed-in player's decision. Pass
 * `hold` when the holds list says the match is held: `MatchOut` itself can't say so.
 */
export function matchStatusCopy(match: Match, hold?: HoldState): MatchStatusCopy {
	const copy = hold && match.status !== 'voided' ? heldCopy(match, hold) : statusCopy(match);
	return canCorrect(match) ? { ...copy, actions: [...copy.actions, 'correct'] } : copy;
}

/**
 * True when the signed-in player may try to correct the match (backend#267): it is pending or
 * disputed, they played in it, and every player in it has a code, since a correction names the
 * same players and the API gives no code for a private player. The backend also refuses a match
 * with an event or a club. `MatchOut` now sends both (backend#302), but the app does not read
 * them yet; frontend#264 will. The backend decides (rule 6).
 */
export function canCorrect(match: Match): boolean {
	if (match.status !== 'pending' && match.status !== 'disputed') return false;
	if (!match.viewerSide) return false;
	return [...match.teamA.players, ...match.teamB.players].every((player) => player.code !== null);
}

function statusCopy(match: Match): MatchStatusCopy {
	const decision = match.viewerDecision;
	switch (match.status) {
		case 'confirmed':
			return {
				title: 'Confirmed',
				text:
					decision === 'confirm'
						? 'You confirmed this score, and it counts in your match history.'
						: 'This score is confirmed, and it counts in your match history.',
				actions: []
			};
		case 'disputed':
			if (decision === 'dispute') {
				return {
					title: 'Disputed',
					text: "You said this score is wrong, so the match doesn't count for now.",
					// The backend refuses a withdraw from anyone else with no open dispute (409).
					actions: match.viewerSide ? ['withdraw'] : []
				};
			}
			return {
				title: 'Disputed',
				text:
					decision === 'withdraw'
						? 'You withdrew your dispute, but another player still says the score is wrong.'
						: "A player in this match said the score is wrong, so it doesn't count for now.",
				actions: []
			};
		case 'voided':
			return {
				title: 'Voided',
				text: "This match was voided, so it doesn't count towards anyone's history.",
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
			actions: []
		};
	}
	if (needsViewerConfirmation(match)) {
		const otherConfirmed = confirmed[otherSide(match.viewerSide)];
		// A withdrawn dispute is still the player's one dispute: disputing again changes nothing.
		const withdrawn = decision === 'withdraw';
		return {
			title: 'Is this the right score?',
			text: withdrawn
				? "You withdrew your dispute, so you can't dispute this match again."
				: otherConfirmed
					? 'The other team confirmed this score, and the match counts once your team does too.'
					: 'The match counts once a player on each team confirms this score.',
			actions: withdrawn ? ['confirm'] : ['confirm', 'dispute']
		};
	}
	if (!waitingOnOtherTeam(match)) {
		return {
			title: 'Waiting for confirmation',
			text: 'This match counts once a player on each team confirms the score.',
			actions: []
		};
	}
	return {
		title: 'Waiting for the other team',
		text: `${
			decision === 'confirm'
				? 'You confirmed this score'
				: 'A player on your team confirmed this score'
		}, and the match counts once a player on the other team confirms it too.`,
		actions: []
	};
}

/**
 * True when the status panel offers the player something to do, so its edge reads "needs your
 * action". A correction alone doesn't count: it is there for when the score is wrong, not a step
 * the match waits on.
 */
export function hasActions(match: Match, hold?: HoldState): boolean {
	return matchStatusCopy(match, hold).actions.some((action) => action !== 'correct');
}

/**
 * The edge of the status panel, which carries its meaning: `disputed` (danger) for a disputed
 * match, `held` (warning) for a match on hold, `action` (neutral, strong) when the player has
 * something to do, and `plain` otherwise.
 */
export type PanelTone = 'disputed' | 'held' | 'action' | 'plain';

export function panelTone(match: Match, hold?: HoldState): PanelTone {
	if (match.status === 'disputed') return 'disputed';
	if (hold && match.status !== 'voided') return 'held';
	return hasActions(match, hold) ? 'action' : 'plain';
}

/**
 * True when the status panel has nothing to add to the badge: a confirmed match that is not on
 * hold. The page drops the panel then, unless it has a one-visit line or an error to show.
 */
export function panelIsQuiet(match: Match, hold?: HoldState): boolean {
	return match.status === 'confirmed' && hold === undefined;
}

/**
 * What an info popover explains (frontend#285): the info button's name, which says what it
 * explains, and each term in a sentence or two.
 */
export type StatusInfo = {
	label: string;
	terms: { term: string; text: string }[];
};

/** Why a held match doesn't count, once the panel's sentence has said there is another match. */
export const HOLD_COUNTS = `Both matches are on hold and don't count until each one is vouched for. ${HOLD_ENDS}`;

/** What a vouch says, for a player in the match. */
export const VOUCH_MEANS =
	"To vouch is to say this is a separate match, not a repeat of the other one. One player from each team needs to vouch, and you can't undo a vouch.";

/** What a vouch says, for a member of the event's organizer, who did not play in it. */
export const VOUCH_MEANS_ORGANIZER =
	"To vouch is to say this is a separate match, not a repeat of the other one. You vouch as a member of the event's organizer, and you can't undo a vouch.";

/** What Home's In progress line explains, for each count it shows. */
export const DISPUTED_MEANS =
	"A player said the score is wrong. The match doesn't count while it is disputed.";
export const ON_HOLD_MEANS =
	'Another match on OPEN has the same teams and date, but other scores. Neither counts until each one is vouched for as a separate match.';

/** The button's name for the terms it explains, such as "What does disputed mean?". */
function infoFor(terms: StatusInfo['terms']): StatusInfo | null {
	if (terms.length === 0) return null;
	const names = terms.map((item) => item.term.toLowerCase());
	const label =
		names.length === 1
			? `What does ${names[0]} mean?`
			: `What do ${names.slice(0, -1).join(', ')} and ${names.at(-1)} mean?`;
	return { label, terms };
}

/**
 * The status panel's info popover, or null when its title needs none. It says how a dispute ends,
 * why a held match doesn't count and, while the panel asks for one, what a vouch is. The panel's
 * own sentence already says what happened, so the popover doesn't repeat it.
 */
export function statusInfo(match: Match, hold?: HoldState): StatusInfo | null {
	const terms: StatusInfo['terms'] = [];
	if (match.status === 'disputed') terms.push({ term: 'Disputed', text: DISPUTE_ENDS });
	if (hold && match.status !== 'voided') {
		terms.push({ term: 'On hold', text: HOLD_COUNTS });
		if (!hold.vouched) {
			terms.push({
				term: 'Vouch',
				text: match.viewerSide === null ? VOUCH_MEANS_ORGANIZER : VOUCH_MEANS
			});
		}
	}
	return infoFor(terms);
}

/** Home's In progress popover, for the counts it shows, or null when it shows none. */
export function progressInfo(disputed: boolean, held: boolean): StatusInfo | null {
	const terms: StatusInfo['terms'] = [];
	if (disputed) terms.push({ term: 'Disputed', text: DISPUTED_MEANS });
	if (held) terms.push({ term: 'On hold', text: ON_HOLD_MEANS });
	return infoFor(terms);
}
