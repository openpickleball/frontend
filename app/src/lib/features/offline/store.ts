import type { Problem, QueuedMatch } from './types.js';

/** Where queued matches are kept. Every method rejects when the storage can't be used. */
export type QueueStore = {
	/** This account's matches, oldest first. */
	list(account: string): Promise<QueuedMatch[]>;
	/** Add a match, or replace it by id. */
	put(item: QueuedMatch): Promise<void>;
	remove(id: string): Promise<void>;
	/** Delete every match of one account. */
	removeAccount(account: string): Promise<void>;
	/** Every account's matches, for the age cleanup. */
	listAll(): Promise<QueuedMatch[]>;
	/**
	 * Delete these matches and, in the same step, add to each account's count of deleted matches.
	 * The count is a number only: no match data and no email.
	 */
	expire(items: { id: string; account: string }[]): Promise<void>;
	/** How many of this account's matches were deleted for age and not yet reported. */
	expiredCount(account: string): Promise<number>;
	/** Forget that count, once the player has been told. */
	clearExpired(account: string): Promise<void>;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

function problemOf(value: unknown): Problem | null | undefined {
	if (value === null) return null;
	if (!isObject(value)) return undefined;
	const { kind, message, fields } = value;
	if (kind !== 'invalid' && kind !== 'duplicate' && kind !== 'refused') return undefined;
	if (typeof message !== 'string' || !isObject(fields)) return undefined;
	const clean: Record<string, string[]> = {};
	for (const [key, messages] of Object.entries(fields)) {
		if (Array.isArray(messages)) clean[key] = messages.filter((m) => typeof m === 'string');
	}
	return { kind, message, fields: clean };
}

/**
 * A stored record as a queued match, or null when it is not one. Stored data is not trusted. The
 * body is sent as it is, and the backend checks it.
 */
export function parseQueued(raw: unknown): QueuedMatch | null {
	if (!isObject(raw)) return null;
	const { id, account, own, body, form, queuedAt } = raw;
	if (typeof id !== 'string' || typeof account !== 'string' || typeof own !== 'string') return null;
	if (typeof queuedAt !== 'string' || !isObject(body)) return null;
	const problem = problemOf(raw.problem);
	if (problem === undefined) return null;
	return { id, account, own, body: body as QueuedMatch['body'], form, queuedAt, problem };
}

const byAge = (a: QueuedMatch, b: QueuedMatch) => a.queuedAt.localeCompare(b.queuedAt);

/** A plain copy, so a Svelte state proxy never reaches the store. */
const plain = (item: QueuedMatch): QueuedMatch => JSON.parse(JSON.stringify(item));

/** A store in memory. For tests. */
export function memoryStore(): QueueStore & {
	all(): QueuedMatch[];
	counts(): Record<string, number>;
} {
	const items = new Map<string, QueuedMatch>();
	const expired = new Map<string, number>();
	return {
		async listAll() {
			return [...items.values()].map(plain).sort(byAge);
		},
		async expire(list) {
			for (const { id, account } of list) {
				if (items.delete(id)) expired.set(account, (expired.get(account) ?? 0) + 1);
			}
		},
		async expiredCount(account) {
			return expired.get(account) ?? 0;
		},
		async clearExpired(account) {
			expired.delete(account);
		},
		counts: () => Object.fromEntries(expired),
		async list(account) {
			return [...items.values()]
				.filter((i) => i.account === account)
				.map(plain)
				.sort(byAge);
		},
		async put(item) {
			items.set(item.id, plain(item));
		},
		async remove(id) {
			items.delete(id);
		},
		async removeAccount(account) {
			for (const [id, item] of items) if (item.account === account) items.delete(id);
			expired.delete(account);
		},
		all: () => [...items.values()].map(plain)
	};
}

export const DB_NAME = 'open-offline';
const DB_VERSION = 2;
const STORE = 'matches';
const BY_ACCOUNT = 'account';
/** One record per account: `{ account, count }`. A number, never match data. */
const EXPIRED = 'expired';

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function finished(tx: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		tx.oncomplete = () => resolve();
		tx.onerror = () => reject(tx.error);
		tx.onabort = () => reject(tx.error ?? new Error('The transaction was aborted.'));
	});
}

/**
 * The store in IndexedDB: database `open-offline`, object store `matches`, keyed by `id`, with an
 * index on `account`. The connection opens on first use. A failed open is tried again next time.
 */
export function indexedDbStore(
	factory: () => IDBFactory | undefined = () =>
		typeof indexedDB === 'undefined' ? undefined : indexedDB
): QueueStore {
	let opening: Promise<IDBDatabase> | null = null;

	function open(): Promise<IDBDatabase> {
		opening ??= new Promise<IDBDatabase>((resolve, reject) => {
			const idb = factory();
			if (!idb) {
				reject(new Error('IndexedDB is not available.'));
				return;
			}
			const req = idb.open(DB_NAME, DB_VERSION);
			req.onupgradeneeded = () => {
				const db = req.result;
				if (!db.objectStoreNames.contains(STORE)) {
					const store = db.createObjectStore(STORE, { keyPath: 'id' });
					store.createIndex(BY_ACCOUNT, 'account');
				}
				if (!db.objectStoreNames.contains(EXPIRED)) {
					db.createObjectStore(EXPIRED, { keyPath: 'account' });
				}
			};
			req.onsuccess = () => {
				const db = req.result;
				// Another tab with a newer version asks to upgrade: let it.
				db.onversionchange = () => {
					db.close();
					opening = null;
				};
				resolve(db);
			};
			req.onerror = () => reject(req.error);
			req.onblocked = () => reject(new Error('IndexedDB is blocked by another tab.'));
		}).catch((error: unknown) => {
			opening = null;
			throw error;
		});
		return opening;
	}

	async function write(work: (store: IDBObjectStore) => void): Promise<void> {
		const tx = (await open()).transaction(STORE, 'readwrite');
		const done = finished(tx);
		work(tx.objectStore(STORE));
		await done;
	}

	return {
		async listAll() {
			const tx = (await open()).transaction(STORE, 'readonly');
			const rows = await request(tx.objectStore(STORE).getAll());
			return rows.flatMap((row) => parseQueued(row) ?? []).sort(byAge);
		},
		async expire(list) {
			if (list.length === 0) return;
			const tx = (await open()).transaction([STORE, EXPIRED], 'readwrite');
			const done = finished(tx);
			const matches = tx.objectStore(STORE);
			const counts = tx.objectStore(EXPIRED);
			const added = new Map<string, number>();
			for (const { id, account } of list) {
				matches.delete(id);
				added.set(account, (added.get(account) ?? 0) + 1);
			}
			for (const [account, n] of added) {
				const read = counts.get(account);
				read.onsuccess = () => {
					const before = isObject(read.result) ? Number(read.result.count) : 0;
					counts.put({ account, count: (Number.isFinite(before) ? before : 0) + n });
				};
			}
			await done;
		},
		async expiredCount(account) {
			const tx = (await open()).transaction(EXPIRED, 'readonly');
			const row = await request(tx.objectStore(EXPIRED).get(account));
			const count = isObject(row) ? Number(row.count) : 0;
			return Number.isFinite(count) && count > 0 ? count : 0;
		},
		async clearExpired(account) {
			const tx = (await open()).transaction(EXPIRED, 'readwrite');
			const done = finished(tx);
			tx.objectStore(EXPIRED).delete(account);
			await done;
		},
		async list(account) {
			const tx = (await open()).transaction(STORE, 'readonly');
			const rows = await request(tx.objectStore(STORE).index(BY_ACCOUNT).getAll(account));
			return rows.flatMap((row) => parseQueued(row) ?? []).sort(byAge);
		},
		put: (item) => write((store) => store.put(plain(item))),
		remove: (id) => write((store) => store.delete(id)),
		async removeAccount(account) {
			const tx = (await open()).transaction([STORE, EXPIRED], 'readwrite');
			const done = finished(tx);
			// Delete in the callback, while the transaction is still active.
			const keys = tx.objectStore(STORE).index(BY_ACCOUNT).getAllKeys(account);
			keys.onsuccess = () => {
				for (const key of keys.result) tx.objectStore(STORE).delete(key);
			};
			tx.objectStore(EXPIRED).delete(account);
			await done;
		}
	};
}
