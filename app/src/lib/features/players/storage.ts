import { parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';

/**
 * Where a typed-in OPEN code is kept on this device (Decision Q3, plans/frontend-v1/plan.md). It is
 * the fallback only against a backend older than backend#124, which cannot create the player (a
 * 405 from `GET me/player`, or a 404 or 405 from `POST me/player`), and when the server can't be
 * reached.
 *
 * The key has a namespace and a version, and ends in the account's email, so two people who
 * share a device do not see each other's code. Bump `VERSION` if the stored value changes shape.
 */
const VERSION = 'v1';
const PREFIX = `open:${VERSION}:my-player-code:`;

/** The part of `Storage` this file uses. */
export type CodeStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type CodeStore = {
	read(email: string): PlayerCode | null;
	/** Returns false when the browser refused to save (private window, full storage). */
	write(email: string, code: PlayerCode): boolean;
	remove(email: string): void;
};

export function storageKey(email: string): string {
	return PREFIX + email.normalize('NFKC').trim().toLowerCase();
}

function browserStorage(): CodeStorage | null {
	try {
		return typeof localStorage === 'undefined' ? null : localStorage;
	} catch {
		// Access can throw when site data is blocked.
		return null;
	}
}

/** A code store over `localStorage`, or over `storage` in tests. Never throws. */
export function createCodeStore(storage?: () => CodeStorage | null): CodeStore {
	const get = storage ?? browserStorage;
	return {
		read(email) {
			try {
				const raw = get()?.getItem(storageKey(email));
				if (!raw) return null;
				const parsed = parsePlayerCode(raw);
				return parsed.ok ? parsed.value : null;
			} catch {
				return null;
			}
		},
		write(email, code) {
			try {
				const target = get();
				if (!target) return false;
				target.setItem(storageKey(email), code);
				return true;
			} catch {
				return false;
			}
		},
		remove(email) {
			try {
				get()?.removeItem(storageKey(email));
			} catch {
				// Nothing to clean up.
			}
		}
	};
}
