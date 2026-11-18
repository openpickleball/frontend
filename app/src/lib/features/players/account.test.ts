import { describe, expect, it } from 'vitest';
import { currentAccountEmail, setAccountEmailSource } from './account.js';

describe('account email source', () => {
	it('the default source rethrows a failure that is not a 401 (offline is not signed out)', async () => {
		// Node has no origin, so the session request fails like a network error.
		setAccountEmailSource(null);
		await expect(currentAccountEmail()).rejects.toMatchObject({ kind: 'network' });
	});

	it('uses a source that is set, and treats an empty answer as signed out', async () => {
		setAccountEmailSource(async () => 'a@example.com');
		expect(await currentAccountEmail()).toBe('a@example.com');
		setAccountEmailSource(() => undefined);
		expect(await currentAccountEmail()).toBeNull();
		setAccountEmailSource(null);
	});
});
