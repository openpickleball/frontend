import { SvelteMap } from 'svelte/reactivity';
import type { Match, MatchCode, PlayerCode } from '#lib/domain/index.js';
import { session } from '#lib/features/auth/index.js';
import { myCode } from '#lib/features/players/index.js';

/** What the player did to a match in this session. */
export type MatchAction = 'confirm' | 'dispute';

/**
 * Who the cache belongs to: the account's email and the player's code together. Two accounts that
 * enter the same code are still two owners. Null when either is missing, so nothing is cached.
 */
export function ownerKey(email: string | null, code: PlayerCode | null): string | null {
	return email && code ? `${email.toLowerCase()}|${code}` : null;
}

/**
 * Matches by code, plus what the player did to them in this session.
 *
 * The API cannot say whether the player already confirmed a match (backend#193). So "I
 * confirmed this" is only known from what happened here: the player pressed Confirm or
 * Dispute, or recorded the match (recording confirms for the submitter's team). A match that
 * arrives in a list has no entry, and the screens do not guess.
 *
 * The cache belongs to one account and player (`ownerKey`). When either changes, or is gone,
 * everything in it is dropped, so one account never sees another's matches. Reads are safe in a
 * `$derived` or a template. Writes drop the old player's data first, so they must not run in one.
 */
export class MatchCache {
	#matches = new SvelteMap<MatchCode, Match>();
	#acted = new SvelteMap<MatchCode, MatchAction>();
	// Reactive, so a read that found nothing (no owner yet) reruns once the first write sets it.
	#owner = $state<string | null>(null);
	#currentOwner: () => string | null;

	/** `currentOwner` says who is signed in. It defaults to the session email and `myCode`. */
	constructor(currentOwner: () => string | null = () => ownerKey(session.email, myCode.code)) {
		this.#currentOwner = currentOwner;
	}

	/** Drop everything when the player changed, and say whether there is a player to cache for. */
	#sync(): boolean {
		const owner = this.#currentOwner();
		if (owner !== this.#owner) {
			this.#matches.clear();
			this.#acted.clear();
			this.#owner = owner;
		}
		return owner !== null;
	}

	#valid(): boolean {
		const owner = this.#currentOwner();
		return owner !== null && owner === this.#owner;
	}

	get(code: MatchCode): Match | undefined {
		return this.#valid() ? this.#matches.get(code) : undefined;
	}

	/** What the player did to this match in this session, or undefined when nothing is known. */
	actedOn(code: MatchCode): MatchAction | undefined {
		return this.#valid() ? this.#acted.get(code) : undefined;
	}

	/** Keep a match, replacing an older copy of it. */
	remember(match: Match): void {
		if (this.#sync()) this.#matches.set(match.code, match);
	}

	rememberAll(matches: readonly Match[]): void {
		for (const match of matches) this.remember(match);
	}

	/** Note that the player confirmed or disputed this match here. */
	markActed(code: MatchCode, action: MatchAction): void {
		if (this.#sync()) this.#acted.set(code, action);
	}

	reset(): void {
		this.#matches.clear();
		this.#acted.clear();
		this.#owner = null;
	}
}

/** The app-wide cache. */
export const matchCache = new MatchCache();
