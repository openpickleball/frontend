import type { OpenComponents } from '#lib/api/index.js';

/** What `POST matches/` takes. The queue keeps it exactly as the record form built it. */
export type MatchBody = OpenComponents['schemas']['MatchCreateIn'];

/**
 * Why the backend refused a queued match, so the player can see it and act.
 * - `invalid`: a 422 or 400. `fields` has the backend's messages by field, as the form keys them.
 * - `duplicate`: a 409 that names no match the player can open.
 * - `refused`: any other answer that sending again would not change, such as a 403 or 404.
 */
export type Problem = {
	kind: 'invalid' | 'duplicate' | 'refused';
	message: string;
	fields: Record<string, string[]>;
};

/** One match kept on the device until the backend has it. */
export type QueuedMatch = {
	/** A random id, only for this device. */
	id: string;
	/** Whose queue this is: see `accountKey`. Never the email itself. */
	account: string;
	/** The player's own OPEN code when they recorded it, to put the form back for them. */
	own: string;
	body: MatchBody;
	/**
	 * The record form as the player filled it, with the names on the chips, so a refused match can
	 * be fixed without typing it again. Opaque here: the record form checks it before using it.
	 */
	form: unknown;
	/** When it was queued, as an ISO date and time. */
	queuedAt: string;
	/** Null while it waits to be sent. Set once the backend refused it. */
	problem: Problem | null;
};
