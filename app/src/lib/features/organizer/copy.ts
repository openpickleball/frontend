/**
 * Every string the organizer Event screens show, so the components and the tests share them.
 * Plain words: "Event", "organizer" and "player".
 */
import { isAppError, type AppError } from '#lib/api/index.js';
import { session } from '#lib/features/auth/index.js';

export const PAGE_TITLE = 'Events';
export const NEW_EVENT = 'New Event';
export const EDIT_EVENT = 'Edit Event';

export const waitingForVerification = (name: string) =>
	`${name} is waiting for verification. You can create Events once OPEN verifies it.`;

export const LIST_EMPTY_TITLE = 'No Events yet';
export const LIST_EMPTY_TEXT = 'Events your organizers create show here.';
export const PAST_THE_END_TITLE = 'There are no Events on this page';
export const BACK_TO_NEWEST = 'Back to the newest';
export const LIST_ERROR = "We couldn't load your Events.";
export const LIST_LABEL = 'Your Events';

export const KIND_NOTE = 'A new kind applies only to matches recorded after the change.';
export const FIXED_NOTE = "The organizer and club can't change.";
export const CLUB_CODE_HINT = 'Optional. The club gives you its code.';
export const CLUB_PICKER_HINT = 'Optional. Only clubs that allow this organizer are listed.';
export const NO_CLUB = 'No club';
export const CHOOSE_KIND = 'Choose a kind';
export const CHOOSE_ORGANIZER = 'Choose an organizer';

export const CREATE_FORBIDDEN =
	"You can't create Events for this organizer right now. The organizer must be verified, and you need two-factor sign-in turned on.";
export const NOT_SAVED = 'The Event could not be saved. Try again.';
export const EDIT_LOCKED =
	"This Event has matches, so its name and dates can't change. You can still change the kind.";
export const EVENT_GONE =
	"This Event can't be changed. It may have been deleted, or you may no longer manage it.";
export const DELETE_PROTECTED = "This Event has matches or results files, so it can't be deleted.";
export const TWO_FACTOR_LINK = 'Set up two-factor';

export const deleteTitle = (name: string) => `Delete ${name}?`;
export const DELETE_TEXT = 'This removes the Event. It cannot be undone.';

/** The fields the Event form has, in the order it shows them. */
export const EVENT_FIELDS = [
	'name',
	'kind',
	'organizer',
	'club',
	'start_date',
	'end_date'
] as const;
export type EventField = (typeof EVENT_FIELDS)[number];

export type EventAction = 'create' | 'edit' | 'delete';

/** What to show for a refused Event action: a form message, and field messages for a 422. */
export type EventErrorCopy = {
	message: string | null;
	/** True when the message should link to two-factor setup. */
	twoFactorLink: boolean;
	fields: Partial<Record<EventField, string>>;
};

const isField = (name: string): name is EventField =>
	(EVENT_FIELDS as readonly string[]).includes(name);

/**
 * The copy for one refused Event action, by status (criteria 5 to 8 of the plan). A 422 puts each
 * message on its field, and any message for another field, or none, becomes the form message.
 */
export function eventErrorCopy(error: unknown, action: EventAction): EventErrorCopy {
	const copy = (message: string | null, twoFactorLink = false): EventErrorCopy => ({
		message,
		twoFactorLink,
		fields: {}
	});
	if (!isAppError(error)) return copy(NOT_SAVED);
	const appError: AppError = error;
	switch (appError.status) {
		case 403:
			if (action === 'create') return copy(CREATE_FORBIDDEN, session.mfaEnrolled !== true);
			break;
		case 404:
			if (action !== 'create') return copy(EVENT_GONE);
			break;
		case 409:
			if (action === 'create') return copy(NOT_SAVED);
			return copy(action === 'edit' ? EDIT_LOCKED : DELETE_PROTECTED);
		case 422: {
			const fields: Partial<Record<EventField, string>> = {};
			const others: string[] = [];
			for (const [name, messages] of Object.entries(appError.fields)) {
				if (!messages[0]) continue;
				if (isField(name)) fields[name] = messages[0];
				else others.push(messages[0]);
			}
			const none = Object.keys(fields).length === 0;
			return {
				message: others[0] ?? (none ? appError.message : null),
				twoFactorLink: false,
				fields
			};
		}
	}
	return copy(appError.message);
}
