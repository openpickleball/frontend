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
export function memoryStore(): QueueStore & { all(): QueuedMatch[] } {
	const items = new Map<string, QueuedMatch>();
	return {
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
		},
		all: () => [...items.values()].map(plain)
	};
}

export const DB_NAME = 'open-offline';
const DB_VERSION = 1;
const STORE = 'matches';
const BY_ACCOUNT = 'account';

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
				const store = req.result.createObjectStore(STORE, { keyPath: 'id' });
				store.createIndex(BY_ACCOUNT, 'account');
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
		async list(account) {
			const tx = (await open()).transaction(STORE, 'readonly');
			const rows = await request(tx.objectStore(STORE).index(BY_ACCOUNT).getAll(account));
			return rows.flatMap((row) => parseQueued(row) ?? []).sort(byAge);
		},
		put: (item) => write((store) => store.put(plain(item))),
		remove: (id) => write((store) => store.delete(id)),
		removeAccount: (account) =>
			write((store) => {
				// Delete in the callback, while the transaction is still active.
				const keys = store.index(BY_ACCOUNT).getAllKeys(account);
				keys.onsuccess = () => {
					for (const key of keys.result) store.delete(key);
				};
			})
	};
}
