import { beforeEach, describe, expect, it } from 'vitest';
import { AppError } from '#lib/api/index.js';
import { buildCode, parsePlayerCode, type PlayerCode } from '#lib/domain/index.js';
import { createMyCode, type MyCode } from './my-code.svelte.js';
import { createCodeStore, storageKey, type CodeStorage } from './storage.js';
import type { MyPlayer } from './types.js';

const CODE_A = buildCode('player', '4RWN8TQ') as PlayerCode;
const CODE_B = buildCode('player', '9HJD3XK') as PlayerCode;

function memoryStorage(): CodeStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (key) => data.get(key) ?? null,
		setItem: (key, value) => void data.set(key, value),
		removeItem: (key) => void data.delete(key)
	};
}

function appError(kind: AppError['kind'], status: number | null): AppError {
	return new AppError({ kind, status, code: 'x', message: 'x', fields: {} });
}

const SERVER_PLAYER: MyPlayer = { code: CODE_A, displayName: 'Sample Player' };

describe('myCode.rename', () => {
	it('shows a saved display name for a code from the server', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		mine.rename('Fern Quill');
		expect(mine.displayName).toBe('Fern Quill');
	});

	it('leaves a code entered on this device without a name', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		mine.save(CODE_B);
		mine.rename('Fern Quill');
		expect(mine.displayName).toBeNull();
	});
});

describe('myCode with me/player available', () => {
	it('uses the server code and never asks for entry', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_A);
		expect(mine.source).toBe('server');
		expect(mine.displayName).toBe('Sample Player');
		expect(mine.prompting).toBe(false);
		expect(mine.canChange).toBe(false);
	});

	it('prefers the server over a code saved on the device', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store
		});
		await mine.load();
		expect(mine.code).toBe(CODE_A);
	});
});

describe('myCode without me/player', () => {
	let storage: ReturnType<typeof memoryStorage>;
	let email: string | null;
	let mine: MyCode;

	beforeEach(() => {
		storage = memoryStorage();
		email = 'a@example.com';
		mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => email,
			store: createCodeStore(() => storage)
		});
	});

	it('asks for entry when nothing is saved', async () => {
		await mine.load();
		expect(mine.status).toBe('needs-entry');
		expect(mine.prompting).toBe(true);
		expect(mine.code).toBeNull();
	});

	it('saves a typed code, fixing its format, and remembers it', async () => {
		await mine.load();
		const result = mine.save('p 4rwn8tq3');
		expect(result).toEqual({ ok: true, code: CODE_A });
		expect(mine.status).toBe('ready');
		expect(mine.source).toBe('device');
		expect(storage.data.get(storageKey('a@example.com'))).toBe(CODE_A);

		// A later visit finds it without asking.
		const later = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await later.load();
		expect(later.status).toBe('ready');
		expect(later.code).toBe(CODE_A);
	});

	it('refuses a bad code and saves nothing', async () => {
		await mine.load();
		const result = mine.save('P-4RWN-8TQ2');
		expect(result.ok).toBe(false);
		expect(mine.status).toBe('needs-entry');
		expect(storage.data.size).toBe(0);
	});

	it('keeps each account on a shared device apart', async () => {
		await mine.load();
		mine.save(CODE_A);

		email = 'B@Example.com';
		const other = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => email,
			store: createCodeStore(() => storage)
		});
		await other.load();
		expect(other.status).toBe('needs-entry');
		other.save(CODE_B);

		await mine.load('a@example.com');
		expect(mine.code).toBe(CODE_A);
		// The key ignores case and spaces in the email.
		expect(storageKey(' b@example.COM ')).toBe(storageKey('b@example.com'));
		await other.load();
		expect(other.code).toBe(CODE_B);
	});

	it('takes the email passed to load() before asking the account source', async () => {
		email = 'wrong@example.com';
		await mine.load('right@example.com');
		mine.save(CODE_A);
		expect(storage.data.has(storageKey('right@example.com'))).toBe(true);
		expect(storage.data.has(storageKey('wrong@example.com'))).toBe(false);
	});

	it('lets the player change a device code, and cancel', async () => {
		await mine.load();
		mine.save(CODE_A);
		mine.change();
		expect(mine.prompting).toBe(true);
		mine.cancel();
		expect(mine.prompting).toBe(false);
		expect(mine.code).toBe(CODE_A);
		mine.change();
		mine.save(CODE_B);
		expect(mine.code).toBe(CODE_B);
		expect(mine.prompting).toBe(false);
		expect(storage.data.get(storageKey('a@example.com'))).toBe(CODE_B);
	});

	it('ignores a damaged value on the device', async () => {
		storage.data.set(storageKey('a@example.com'), 'garbage!');
		await mine.load();
		expect(mine.status).toBe('needs-entry');
	});

	it('is signed out when there is no account', async () => {
		email = null;
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('reports a failed save on the device', async () => {
		const broken = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => ({
				getItem: () => null,
				setItem: () => {
					throw new Error('full');
				},
				removeItem: () => {}
			}))
		});
		await broken.load();
		broken.save(CODE_A);
		expect(broken.status).toBe('ready');
		expect(broken.storageFailed).toBe(true);
	});
});

describe('myCode reset and server codes', () => {
	it('never shows account A code to account B after a reset', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_A);
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => null,
			store
		});
		await mine.load('a@example.com');
		expect(mine.code).toBe(CODE_A);

		mine.reset();
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
		expect(mine.email).toBeNull();

		await mine.load('b@example.com');
		expect(mine.code).toBeNull();
		expect(mine.status).toBe('needs-entry');
	});

	it('drops a load that was in flight when reset ran', async () => {
		let release: (player: MyPlayer | null) => void = () => {};
		const mine = createMyCode({
			fetchMyPlayer: () => new Promise<MyPlayer | null>((resolve) => (release = resolve)),
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		const pending = mine.load();
		mine.reset();
		release(SERVER_PLAYER);
		await pending;
		expect(mine.status).toBe('idle');
		expect(mine.code).toBeNull();
	});

	it('does not carry the email from a previous load onto a server code', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => null,
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load('a@example.com');
		expect(mine.email).toBe('a@example.com');
		await mine.load();
		expect(mine.email).toBeNull();
	});

	it('refuses to overwrite a server code', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => SERVER_PLAYER,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		const result = mine.save(CODE_B);
		expect(result.ok).toBe(false);
		expect(mine.code).toBe(CODE_A);
		expect(storage.data.size).toBe(0);
	});

	it('shows the error state when the account cannot be found out (offline)', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => {
				throw appError('network', null);
			},
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});
});

describe('myCode when me/player fails', () => {
	it('is signed out on a 401', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('unauthenticated', 401);
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('signed-out');
	});

	it('falls back to the device code on a network error', async () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('network', null);
			},
			accountEmail: async () => 'a@example.com',
			store
		});
		await mine.load();
		expect(mine.status).toBe('ready');
		expect(mine.code).toBe(CODE_B);
	});

	it('shows an error, not the prompt, when it failed and nothing is saved', async () => {
		const mine = createMyCode({
			fetchMyPlayer: async () => {
				throw appError('server', 500);
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		await mine.load();
		expect(mine.status).toBe('error');
	});

	it('only the latest load counts', async () => {
		let release: (player: MyPlayer | null) => void = () => {};
		let calls = 0;
		const mine = createMyCode({
			fetchMyPlayer: () => {
				calls += 1;
				return calls === 1
					? new Promise<MyPlayer | null>((resolve) => (release = resolve))
					: Promise.resolve({ code: CODE_B, displayName: 'Second' });
			},
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => memoryStorage())
		});
		const first = mine.load();
		await mine.load();
		release(SERVER_PLAYER);
		await first;
		expect(mine.code).toBe(CODE_B);
	});
});

describe('myCode.forget (sign out)', () => {
	it('deletes the saved code and forgets the account', async () => {
		const storage = memoryStorage();
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store: createCodeStore(() => storage)
		});
		await mine.load();
		mine.save(CODE_A);
		expect(storage.data.has(storageKey('a@example.com'))).toBe(true);

		mine.forget('a@example.com');
		expect(storage.data.size).toBe(0);
		expect(mine.code).toBeNull();
		expect(mine.email).toBeNull();
	});

	it('deletes the entry of the given account even before the profile has loaded', () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('a@example.com', CODE_A);
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store
		});
		mine.forget('A@Example.com');
		expect(storage.data.size).toBe(0);
	});

	it('leaves another account entry alone', () => {
		const storage = memoryStorage();
		const store = createCodeStore(() => storage);
		store.write('b@example.com', CODE_B);
		const mine = createMyCode({
			fetchMyPlayer: async () => null,
			accountEmail: async () => 'a@example.com',
			store
		});
		mine.forget('a@example.com');
		expect(storage.data.has(storageKey('b@example.com'))).toBe(true);
	});
});

describe('codes in these tests', () => {
	it('are valid player codes', () => {
		expect(parsePlayerCode(CODE_A).ok).toBe(true);
		expect(parsePlayerCode(CODE_B).ok).toBe(true);
	});
});
