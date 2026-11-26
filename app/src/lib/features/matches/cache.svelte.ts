import { SvelteMap, SvelteSet } from 'svelte/reactivity';
import type { Hold, Match, MatchCode, PlayerCode } from '#lib/domain/index.js';

/** What a player can do to a match they played in, or an organizer to a held event match. */
export type MatchAction = 'confirm' | 'dispute' | 'withdraw' | 'vouch';

/** What the app knows about a match's hold: whether the viewer's side has vouched for it. */
export type HoldState = { vouched: boolean };

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
	// Matches the player has just recorded, until their page says so once.
	#recorded = new SvelteSet<MatchCode>();
	// Corrections the player has just saved, until their page says so once.
	#corrected = new SvelteSet<MatchCode>();
	// Old match to the correction that replaced it, for corrections saved in this visit.
	// `MatchOut` doesn't link the two, so the app knows only what it did itself.
	#replacedBy = new SvelteMap<MatchCode, MatchCode>();
	// Held matches the viewer may vouch for, from the holds list. `MatchOut` has no hold field,
	// so a match not in here is either not held or not known to be held.
	#holds = new SvelteMap<MatchCode, HoldState>();

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
			this.#holds.clear();
			this.#replacedBy.clear();
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
		this.#holds.delete(code);
	}

	/** The match's hold, when the holds list says it is held. Undefined when not held or not known. */
	holdOf(code: MatchCode): HoldState | undefined {
		return this.#valid() ? this.#holds.get(code) : undefined;
	}

	/**
	 * Keep held matches from the holds list, and their matches. With `complete`, the list was read
	 * in full, so a match no longer in it is no longer held.
	 */
	rememberHolds(holds: readonly Hold[], { complete = false }: { complete?: boolean } = {}): void {
		if (!this.#sync()) return;
		if (complete) {
			const listed = (code: MatchCode) => holds.some((hold) => hold.match.code === code);
			for (const code of [...this.#holds.keys()]) if (!listed(code)) this.#holds.delete(code);
		}
		for (const hold of holds) {
			this.#matches.set(hold.match.code, hold.match);
			this.#holds.set(hold.match.code, { vouched: hold.vouched });
		}
	}

	/** Note that the viewer's side vouched for a held match. */
	markVouched(code: MatchCode): void {
		if (this.#sync() && this.#holds.has(code)) this.#holds.set(code, { vouched: true });
	}

	/** Drop a match's hold: the holds list no longer has it, or the API said it is not held. */
	endHold(code: MatchCode): void {
		this.#holds.delete(code);
	}

	/** Note that the player just recorded this match, so its page can say so once. */
	markRecorded(code: MatchCode): void {
		this.#recorded.add(code);
	}

	/** True once after `markRecorded`, then false. Not reactive: call it from an effect, not a `$derived`. */
	takeRecorded(code: MatchCode): boolean {
		return this.#recorded.delete(code);
	}

	/**
	 * Note that the player just saved `correction` in place of `old`: its page says so once, and
	 * the old match's page links to it. The old match is voided now, so its cached copy says so.
	 */
	markCorrected(correction: MatchCode, old: MatchCode): void {
		if (!this.#sync()) return;
		this.#corrected.add(correction);
		this.#replacedBy.set(old, correction);
		const before = this.#matches.get(old);
		if (before) this.#matches.set(old, { ...before, status: 'voided' });
		this.#holds.delete(old);
	}

	/** True once after `markCorrected`, then false. Not reactive: call it from an effect. */
	takeCorrected(code: MatchCode): boolean {
		return this.#corrected.delete(code);
	}

	/** The correction the player saved in place of this match, in this visit. */
	replacementOf(code: MatchCode): MatchCode | undefined {
		return this.#valid() ? this.#replacedBy.get(code) : undefined;
	}

	reset(): void {
		this.#recorded.clear();
		this.#corrected.clear();
		this.#replacedBy.clear();
		this.#matches.clear();
		this.#holds.clear();
		this.#owner = null;
	}
}

/** The app-wide cache. */
export const matchCache = new MatchCache();
