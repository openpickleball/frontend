import { SvelteMap } from 'svelte/reactivity';
import type { Match, MatchCode, PlayerCode } from '#lib/domain/index.js';
import { myCode } from '#lib/features/players/index.js';

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
 * The cache belongs to one account and player (`ownerKey`). When either changes, or is gone,
 * everything in it is dropped, so one account never sees another's matches. Reads are safe in a
 * `$derived` or a template. Writes drop the old player's data first, so they must not run in one.
 */
export class MatchCache {
	#matches = new SvelteMap<MatchCode, Match>();
	// Reactive, so a read that found nothing (no owner yet) reruns once the first write sets it.
	#owner = $state<string | null>(null);
	#currentOwner: () => string | null;
	#ownerSource: (() => string | null) | null = null;

	/**
	 * `currentOwner` says who is signed in. By default it asks the source set with
	 * `setOwnerSource`, and with none set it is the player's code alone.
	 */
	constructor(currentOwner?: () => string | null) {
		this.#currentOwner = currentOwner ?? (() => (this.#ownerSource ?? (() => myCode.code))());
	}

	/**
	 * Say who the cache belongs to, for example `ownerKey(session.email, myCode.code)`. This
	 * feature does not import the auth feature, so the root layout wires it. Pass null to go back
	 * to the player's code alone.
	 */
	setOwnerSource(source: (() => string | null) | null): void {
		this.#ownerSource = source;
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

	reset(): void {
		this.#matches.clear();
		this.#owner = null;
	}
}

/** The app-wide cache. */
export const matchCache = new MatchCache();
