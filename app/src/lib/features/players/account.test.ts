import { describe, expect, it } from 'vitest';
import { currentAccountEmail, setAccountEmailSource } from './account.js';

describe('account email source', () => {
	it('with no source set it throws, so a missing setup is an error and not "signed out"', async () => {
		setAccountEmailSource(null);
		await expect(currentAccountEmail()).rejects.toThrow(/setAccountEmailSource/);
	});

	it('uses a source that is set, and treats an empty answer as signed out', async () => {
		setAccountEmailSource(async () => 'a@example.com');
		expect(await currentAccountEmail()).toBe('a@example.com');
		setAccountEmailSource(() => undefined);
		expect(await currentAccountEmail()).toBeNull();
		setAccountEmailSource(null);
	});
});
