import type { Match, MatchCode } from '#lib/domain/index.js';
import { accountKey } from './account.js';
import { sendQueued, type SendOutcome } from './send.js';
import { indexedDbStore, type QueueStore } from './store.js';
import type { MatchBody, QueuedMatch } from './types.js';

/**
 * Why the waiting matches are still waiting, after the last try.
 * - `idle`: nothing has stopped them. They go on the next send.
 * - `offline`: there was no connection.
 * - `signin`: the backend answered 401. They go once the player signs in again.
 * - `mfa`: the backend answered 403 `mfa_required`. They go once the session passes two-factor.
 * - `retry`: the server failed or was busy. They go on the next try.
 */
export type WaitReason = 'idle' | 'offline' | 'signin' | 'mfa' | 'retry';

/** One match that left the queue because the backend has it. */
export type SentMatch = {
	/** The match's code, when known. */
	code: MatchCode | null;
	/** The match as the backend returned it, for a match cache. Null for a duplicate. */
	match: Match | null;
	/** True when the backend already had it (a 409 that names it). */
	duplicate: boolean;
};

export type QueueDeps = {
	store: QueueStore;
	send: (body: MatchBody) => Promise<SendOutcome>;
	accountKey: (email: string) => Promise<string>;
	/** What the browser says about the connection. */
	online: () => boolean;
	newId: () => string;
	now: () => Date;
	/**
	 * Run `work` unless another tab is already sending. The default uses the Web Locks API where
	 * the browser has it, and runs `work` without a lock otherwise.
	 */
	exclusive: (work: () => Promise<void>) => Promise<void>;
};

/** A queued match older than this is deleted. See `plans/offline-match-queue/plan.md`. */
export const MAX_QUEUE_AGE_DAYS = 30;

export type NewQueuedMatch = { own: string; body: MatchBody; form: unknown };

const LOCK_NAME = 'open-offline-queue';

function webLock(work: () => Promise<void>): Promise<void> {
	const locks = typeof navigator === 'undefined' ? undefined : navigator.locks;
	if (!locks) return work();
	return locks.request(LOCK_NAME, { ifAvailable: true }, async (lock) => {
		if (lock) await work();
	});
}

/** A copy without Svelte's state proxy, safe to hand to IndexedDB. */
const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/**
 * The matches recorded on this device that the backend doesn't have yet, for the signed-in
 * account only (see `plans/offline-match-queue/plan.md`).
 *
 * `setAccount(email)` picks whose queue this is, reads it and sends it. Pass null when nobody is
 * signed in: the queue then shows and sends nothing. Each match is sent oldest first, one at a
 * time. A match leaves the device only when the backend has it, when the player deletes it
 * (`remove`), or on sign out or account deletion (`forgetEmail`, `forget`). A match the backend
 * refused stays, with its `problem`,
 * until the player fixes or deletes it.
 */
export class OfflineQueue {
	/** This account's matches, oldest first: waiting ones and refused ones. */
	items = $state<QueuedMatch[]>([]);
	/** Why the waiting matches are still waiting. */
	reason = $state<WaitReason>('idle');
	/** How many of this account's matches were deleted for age and the player hasn't been told. */
	expired = $state(0);
	/** True while a send is under way. */
	sending = $state(false);
	/** What the browser says about the connection. Kept current by `start()`. */
	online = $state(true);

	#deps: QueueDeps;
	#account: string | null = null;
	/** The email `#account` was made from, in memory only, so `forgetEmail` can match it at once. */
	#email: string | null = null;
	/** Bumped on every account change, so a late answer never lands in another account's queue. */
	#run = 0;
	#flushing: Promise<void> | null = null;
	#purging: Promise<void> | null = null;
	/** Set when a match was added during a send, so one more send picks it up. */
	#again = false;
	#listeners: ((sent: SentMatch[]) => void)[] = [];

	constructor(deps: QueueDeps) {
		this.#deps = deps;
		this.online = deps.online();
	}

	/** The matches waiting to be sent. */
	get waiting(): QueuedMatch[] {
		return this.items.filter((item) => item.problem === null);
	}

	/** The matches the backend refused, for the player to fix or delete. */
	get refused(): QueuedMatch[] {
		return this.items.filter((item) => item.problem !== null);
	}

	/** Every match on this device the backend doesn't have. */
	get unsent(): number {
		return this.items.length;
	}

	/** Whose queue to show and send. Reads it, then sends it. */
	async setAccount(email: string | null): Promise<void> {
		const run = ++this.#run;
		const account = email ? await this.#deps.accountKey(email) : null;
		if (run !== this.#run) return;
		if (account === this.#account) return;
		this.#account = account;
		this.#email = account ? email : null;
		this.items = [];
		this.reason = 'idle';
		this.expired = 0;
		if (!account) return;
		await this.purgeExpired();
		if (run !== this.#run) return;
		await this.#reload(run);
		await this.#loadExpired(run);
		if (run !== this.#run) return;
		await this.flush();
	}

	/**
	 * Keep a match to send later, then try to send it. Rejects when nobody is signed in or the
	 * device can't store it, so the caller can say the match was not saved.
	 */
	async add({ own, body, form }: NewQueuedMatch): Promise<QueuedMatch> {
		const account = this.#account;
		if (!account) throw new Error('Nobody is signed in.');
		const item: QueuedMatch = {
			id: this.#deps.newId(),
			account,
			own,
			body: plain(body),
			form: plain(form ?? null),
			queuedAt: this.#deps.now().toISOString(),
			problem: null
		};
		await this.#deps.store.put(item);
		if (account === this.#account) this.items = [...this.items, item];
		this.online = this.#deps.online();
		if (!this.online) this.reason = 'offline';
		if (this.#flushing) this.#again = true;
		else void this.flush();
		return item;
	}

	/** Send every waiting match, oldest first. Stops at the first one that must wait. */
	flush(): Promise<void> {
		this.#flushing ??= (async () => {
			try {
				do {
					this.#again = false;
					await this.#flush();
				} while (this.#again && this.reason === 'idle');
			} finally {
				this.#flushing = null;
			}
		})();
		return this.#flushing;
	}

	async #flush(): Promise<void> {
		const account = this.#account;
		const run = this.#run;
		if (!account) return;
		this.sending = true;
		const sent: SentMatch[] = [];
		try {
			await this.#deps.exclusive(async () => {
				// Another tab may have sent some since this one read them.
				await this.#reload(run);
				for (const item of this.waiting) {
					if (run !== this.#run) return;
					this.online = this.#deps.online();
					if (!this.online) {
						this.reason = 'offline';
						return;
					}
					const outcome = await this.#deps.send(item.body);
					const done = await this.#settle(item, outcome, run);
					if (done) sent.push(done);
					if (outcome.kind === 'signin' || outcome.kind === 'mfa' || outcome.kind === 'retry') {
						return;
					}
				}
				if (run === this.#run) this.reason = 'idle';
			});
		} catch {
			// The store failed. What is stored is still there for the next try.
			if (run === this.#run) this.reason = 'retry';
		} finally {
			if (run === this.#run) this.sending = false;
		}
		if (sent.length > 0) for (const listener of this.#listeners) listener(sent);
	}

	/** Act on one answer. Returns the match when it left the queue because the backend has it. */
	async #settle(item: QueuedMatch, outcome: SendOutcome, run: number): Promise<SentMatch | null> {
		const current = run === this.#run;
		switch (outcome.kind) {
			case 'sent':
			case 'duplicate': {
				// The backend has it, whoever is signed in now.
				await this.#deps.store.remove(item.id);
				if (current) this.items = this.items.filter((i) => i.id !== item.id);
				return outcome.kind === 'sent'
					? { code: outcome.match?.code ?? null, match: outcome.match, duplicate: false }
					: { code: outcome.code, match: null, duplicate: true };
			}
			case 'refused': {
				// Only into the queue it came from: a sign out may have deleted it meanwhile.
				if (!current) return null;
				const refused = { ...plain(item), problem: outcome.problem };
				await this.#deps.store.put(refused);
				this.items = this.items.map((i) => (i.id === item.id ? refused : i));
				return null;
			}
			case 'signin':
				if (current) this.reason = 'signin';
				return null;
			case 'mfa':
				if (current) this.reason = 'mfa';
				return null;
			case 'retry':
				if (current) this.reason = outcome.offline ? 'offline' : 'retry';
				return null;
		}
	}

	/**
	 * Delete every account's matches that were queued more than `MAX_QUEUE_AGE_DAYS` ago, so a
	 * player who never signs in on this device again leaves nothing behind. Each account keeps a
	 * count of what was deleted (a number only), which is told to that player at their next sign
	 * in. The count is written in the same step as the delete, so nothing goes unreported.
	 */
	purgeExpired(): Promise<void> {
		this.#purging ??= (async () => {
			try {
				const cutoff = this.#deps.now().getTime() - MAX_QUEUE_AGE_DAYS * 24 * 60 * 60 * 1000;
				const old = (await this.#deps.store.listAll()).filter(
					(item) => Date.parse(item.queuedAt) < cutoff
				);
				if (old.length === 0) return;
				await this.#deps.store.expire(old.map(({ id, account }) => ({ id, account })));
				const run = this.#run;
				await this.#reload(run);
				await this.#loadExpired(run);
			} catch {
				// The store failed. The cleanup runs again the next time the app opens.
			} finally {
				this.#purging = null;
			}
		})();
		return this.#purging;
	}

	/** The player has read the notice about deleted matches: forget the count. */
	async dismissExpired(): Promise<void> {
		const account = this.#account;
		this.expired = 0;
		if (!account) return;
		try {
			await this.#deps.store.clearExpired(account);
		} catch {
			// The notice may show once more on the next sign in.
		}
	}

	async #loadExpired(run: number): Promise<void> {
		const account = this.#account;
		if (!account) return;
		try {
			const count = await this.#deps.store.expiredCount(account);
			if (run === this.#run) this.expired = count;
		} catch {
			// No count could be read. It stays on the device for the next sign in.
		}
	}

	/** Delete one match from this device, because the player asked to. */
	async remove(id: string): Promise<void> {
		await this.#deps.store.remove(id);
		this.items = this.items.filter((item) => item.id !== id);
	}

	/**
	 * Delete this account's queue from the device and stop showing it. For a sign out on purpose
	 * or a deleted account. A session that ends by itself is not a sign out: keep the queue then.
	 */
	async forget(): Promise<void> {
		const account = this.#account;
		this.#run++;
		this.#account = null;
		this.#email = null;
		this.items = [];
		this.reason = 'idle';
		this.expired = 0;
		this.sending = false;
		if (account) await this.#deps.store.removeAccount(account);
	}

	/**
	 * Delete the queue of the account with this email from the device, even when the queue shows
	 * nobody now (a deletion whose session a 401 had already ended). It stops showing the queue
	 * only when it is that account's: another account's view is never cleared.
	 */
	async forgetEmail(email: string): Promise<void> {
		// The account shown now: clear its view at once, before any await.
		if (this.#account && this.#email === email) return this.forget();
		const account = await this.#deps.accountKey(email);
		if (account === this.#account) return this.forget();
		await this.#deps.store.removeAccount(account);
	}

	/** Call `listener` with the matches that left the queue after each send. Returns a stop. */
	onSent(listener: (sent: SentMatch[]) => void): () => void {
		this.#listeners.push(listener);
		return () => {
			this.#listeners = this.#listeners.filter((l) => l !== listener);
		};
	}

	/**
	 * Send again when the connection comes back and when the app comes back to the screen. There
	 * is no Background Sync, because iOS doesn't have it. Returns a function that stops listening.
	 */
	start(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window): () => void {
		const update = () => {
			this.online = this.#deps.online();
			if (this.online && this.waiting.length > 0) void this.flush();
		};
		const offline = () => {
			this.online = false;
		};
		const visible = () => {
			if (typeof document === 'undefined' || document.visibilityState === 'visible') update();
		};
		target.addEventListener('online', update);
		target.addEventListener('offline', offline);
		target.addEventListener('visibilitychange', visible);
		return () => {
			target.removeEventListener('online', update);
			target.removeEventListener('offline', offline);
			target.removeEventListener('visibilitychange', visible);
		};
	}

	async #reload(run: number): Promise<void> {
		const account = this.#account;
		if (!account) return;
		try {
			const items = await this.#deps.store.list(account);
			if (run === this.#run) this.items = items;
		} catch {
			// Nothing could be read. Keep what this tab knows.
		}
	}
}

export function createOfflineQueue(deps: Partial<QueueDeps> = {}): OfflineQueue {
	return new OfflineQueue({
		store: deps.store ?? indexedDbStore(),
		send: deps.send ?? ((body) => sendQueued(body)),
		accountKey: deps.accountKey ?? accountKey,
		online: deps.online ?? (() => typeof navigator === 'undefined' || navigator.onLine !== false),
		newId: deps.newId ?? (() => crypto.randomUUID()),
		// eslint-disable-next-line svelte/prefer-svelte-reactivity -- a timestamp to store, not state
		now: deps.now ?? (() => new Date()),
		exclusive: deps.exclusive ?? webLock
	});
}

/** The app-wide queue. The root layout sets its account. */
export const offlineQueue = createOfflineQueue();
