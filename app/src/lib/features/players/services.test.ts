import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '#lib/api/index.js';
import type { MyPlayerOut } from '#lib/api/provisional.js';

const calls = vi.hoisted(() => ({ GET: vi.fn(), PATCH: vi.fn() }));

vi.mock('#lib/api/index.js', async (original) => ({
	...(await original<typeof import('#lib/api/index.js')>()),
	provisionalApi: calls
}));

const { fetchMySettings, updateMySettings } = await import('./services.js');

const DTO: MyPlayerOut = {
	code: 'P-4RWN-8TQ2',
	display_name: 'Fern Mock',
	home_club: null,
	privacy: {
		city_region_visibility: 'signed_in',
		match_history_visibility: 'private',
		rating_history_visibility: 'signed_in',
		stats_visibility: 'private',
		home_club_visibility: 'signed_in'
	}
};

const ok = (data: unknown) => ({ data, error: undefined, response: new Response() });
const failed = (status: number) => ({
	data: undefined,
	error: { code: 'not_found', message: 'Not found.' },
	response: new Response(null, { status })
});

describe('fetchMySettings', () => {
	beforeEach(() => calls.GET.mockReset());

	it('maps me/player to the name and privacy settings', async () => {
		calls.GET.mockResolvedValue(ok(DTO));
		expect(await fetchMySettings()).toEqual({
			displayName: 'Fern Mock',
			privacy: {
				match_history: 'private',
				stats: 'private',
				rating_history: 'signed_in',
				home_club: 'signed_in',
				city_region: 'signed_in'
			}
		});
		expect(calls.GET).toHaveBeenCalledWith('/api/v1/me/player');
	});

	it('is null when the backend has no me/player yet', async () => {
		calls.GET.mockResolvedValue(failed(404));
		expect(await fetchMySettings()).toBeNull();
		calls.GET.mockResolvedValue(failed(405));
		expect(await fetchMySettings()).toBeNull();
	});

	it('throws other failures', async () => {
		calls.GET.mockResolvedValue(failed(500));
		await expect(fetchMySettings()).rejects.toBeInstanceOf(AppError);
	});
});

describe('updateMySettings', () => {
	beforeEach(() => calls.PATCH.mockReset());

	it('sends only what changes, with the backend field names', async () => {
		calls.PATCH.mockResolvedValue(ok(DTO));
		await updateMySettings({ privacy: { stats: 'private' } });
		expect(calls.PATCH).toHaveBeenLastCalledWith('/api/v1/me/player', {
			body: { privacy: { stats_visibility: 'private' } }
		});
		await updateMySettings({ displayName: 'Fern Quill' });
		expect(calls.PATCH).toHaveBeenLastCalledWith('/api/v1/me/player', {
			body: { display_name: 'Fern Quill' }
		});
	});

	it('returns the settings the backend holds', async () => {
		calls.PATCH.mockResolvedValue(ok(DTO));
		const saved = await updateMySettings({ displayName: 'Anything' });
		expect(saved.displayName).toBe('Fern Mock');
		expect(saved.privacy.match_history).toBe('private');
	});

	it('throws when the save fails', async () => {
		calls.PATCH.mockResolvedValue(failed(422));
		await expect(updateMySettings({ displayName: 'x' })).rejects.toBeInstanceOf(AppError);
	});
});
