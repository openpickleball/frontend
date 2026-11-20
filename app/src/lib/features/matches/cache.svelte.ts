import { SvelteMap } from 'svelte/reactivity';
import type { Match, MatchCode, PlayerCode } from '#lib/domain/index.js';

/** What a player can do to a match they played in. */
export type MatchAction = 'confirm' | 'dispute';

/**
 * Who the cache belongs to: the account's email and the player's code together. Two accounts that
 * enter the same code are still two owners. Null when either is missing, so nothing is cached.
 */
export function ownerKey(email: string | null, code: PlayerCode | null): string | null {
	return email && code ? `${email.toLowerCase()}|${code}` : null;
}

/**
 * Matches by code. Every match carries the signed-in player's side, their latest decision and
 * which teams confirmed (`viewerSide`, `viewerDecision`, `confirmedBySide`), so the cache keeps
 * nothing else. A confirm or dispute replaces the match with the one the API returns.
 *
 * The cache belongs to one account and player (`ownerKey`), which it reads from its one owner
 * source. When either changes, or is gone, everything in it is dropped, so one account never sees
 * another's matches. `reset()` drops everything at once, for a sign out. Reads are safe in a
 * `$derived` or a template. Writes drop the old player's data first, so they must not run in one.
 */
export class MatchCache {
	#matches = new SvelteMap<MatchCode, Match>();
	// Reactive, so a read that found nothing (no owner yet) reruns once the first write sets it.
	#owner = $state<string | null>(null);
	#currentOwner: () => string | null;

	/**
	 * `currentOwner` says who is signed in, for example `ownerKey(session.email, myCode.code)`. With
	 * none, there is no owner and nothing is cached. The app-wide cache gets its owner from the root
	 * layout (`setOwnerSource`), because this feature does not import the auth feature.
	 */
	constructor(currentOwner: () => string | null = () => null) {
		this.#currentOwner = currentOwner;
	}

	/** Replace who the cache belongs to. The root layout calls it once for the app-wide cache. */
	setOwnerSource(source: () => string | null): void {
		this.#currentOwner = source;
	}

	/** Drop everything when the player changed, and say whether there is a player to cache for. */
	#sync(): boolean {
		const owner = this.#currentOwner();
		if (owner !== this.#owner) {
			this.#matches.clear();
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

	/** Keep a match, replacing an older copy of it. */
	remember(match: Match): void {
		if (this.#sync()) this.#matches.set(match.code, match);
	}

	rememberAll(matches: readonly Match[]): void {
		for (const match of matches) this.remember(match);
	}

	/** Drop one match, for example when the API says it is not there for this player. */
	forget(code: MatchCode): void {
		this.#matches.delete(code);
	}

	reset(): void {
		this.#matches.clear();
		this.#owner = null;
	}
}

/** The app-wide cache. */
export const matchCache = new MatchCache();
