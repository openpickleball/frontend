import { describe, expect, it } from 'vitest';
import { PLAYERS } from './fixtures';
import { isNameFormatLocked } from './player-rules';
import { createMockStore } from './store';

const thisYear = new Date().getFullYear();

describe('isNameFormatLocked, as backend is_name_format_locked', () => {
	it('is false for an adult and true for a player aged 13 to 17', () => {
		expect(isNameFormatLocked(1990, 6)).toBe(false);
		expect(isNameFormatLocked(thisYear - 15, 1)).toBe(true);
	});

	it('fails closed when the birth year or month is missing or out of range', () => {
		expect(isNameFormatLocked(1990, undefined)).toBe(true);
		expect(isNameFormatLocked(undefined, 6)).toBe(true);
		expect(isNameFormatLocked(1990, null)).toBe(true);
		expect(isNameFormatLocked(1990, 0)).toBe(true);
		expect(isNameFormatLocked(1990, 13)).toBe(true);
		expect(isNameFormatLocked(1990.5, 6)).toBe(true);
		expect(isNameFormatLocked(1990, '6')).toBe(true);
	});
});

describe('a mock player whose birth month is missing', () => {
	function playerWithoutMonth() {
		const store = createMockStore();
		const player = store.playerByCode(PLAYERS[0].code);
		if (!player) throw new Error('no fixture player');
		(player as { birthMonth: unknown }).birthMonth = undefined;
		return { store, player };
	}

	it('reads as locked, like the backend', () => {
		const { store, player } = playerWithoutMonth();
		expect(store.myPlayerOut(player).name_format_locked).toBe(true);
	});

	it('is refused the full name', () => {
		const { store, player } = playerWithoutMonth();
		player.privacy.name_format = 'first_last_initial';
		const issues = store.updateMyPlayer(player, { privacy: { name_format: 'full' } });
		expect(issues).toEqual([
			{
				field: 'body.privacy.name_format',
				code: 'invalid',
				message: 'Your full last name can be shown only from age 18.'
			}
		]);
		expect(player.privacy.name_format).toBe('first_last_initial');
	});
});
