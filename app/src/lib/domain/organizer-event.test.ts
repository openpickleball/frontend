import { describe, expect, it } from 'vitest';
import type { components } from '../api/generated/open';
import { MappingError, toOrganizerEvent, toOrganizerEventPage } from './mappers';
import { EVENT_KIND_LABELS, EVENT_KINDS } from './models';
import { EVENT_NAME_MAX, eventInputSchema, zodFieldErrors } from './schemas';

type EventDto = components['schemas']['EventOut'];

function eventDto(overrides: Partial<EventDto> = {}): EventDto {
	return {
		code: 'E-MOCK-0001',
		name: 'Harbor Fall Classic',
		kind: 'tournament',
		organizer: 'G-K7MQ-2RD4',
		club: null,
		start_date: '2026-10-04',
		end_date: '2026-10-05',
		...overrides
	};
}

describe('EVENT_KIND_LABELS', () => {
	it('names every kind in plain words', () => {
		expect(EVENT_KINDS.map((kind) => EVENT_KIND_LABELS[kind])).toEqual([
			'Tournament',
			'League',
			'Verified rec play'
		]);
	});
});

describe('toOrganizerEvent', () => {
	it('renames the fields to camelCase', () => {
		expect(toOrganizerEvent(eventDto({ club: 'C-AAAA-1111' }))).toEqual({
			code: 'E-MOCK-0001',
			name: 'Harbor Fall Classic',
			kind: 'tournament',
			organizer: 'G-K7MQ-2RD4',
			club: 'C-AAAA-1111',
			startDate: '2026-10-04',
			endDate: '2026-10-05'
		});
	});

	it('keeps a missing club as null', () => {
		expect(toOrganizerEvent(eventDto()).club).toBeNull();
	});

	it('throws a MappingError for a kind the app does not know', () => {
		const dto = { ...eventDto(), kind: 'self_reported' } as unknown as EventDto;
		expect(() => toOrganizerEvent(dto)).toThrow(MappingError);
	});
});

describe('toOrganizerEventPage', () => {
	it('maps the items and keeps the count', () => {
		const page = toOrganizerEventPage({
			items: [eventDto(), eventDto({ code: 'E-MOCK-0002', kind: 'league' })],
			count: 41
		});
		expect(page.count).toBe(41);
		expect(page.items.map((event) => event.kind)).toEqual(['tournament', 'league']);
	});
});

describe('eventInputSchema', () => {
	const valid = {
		name: '  Harbor Fall Classic ',
		kind: 'tournament',
		organizer: 'G-K7MQ-2RD4',
		club: '',
		start_date: '2026-10-04',
		end_date: '2026-10-05'
	};

	it('trims the name and sends no club when the club is blank', () => {
		const result = eventInputSchema.safeParse(valid);
		expect(result.success && result.data).toEqual({
			name: 'Harbor Fall Classic',
			kind: 'tournament',
			organizer: 'G-K7MQ-2RD4',
			club: null,
			start_date: '2026-10-04',
			end_date: '2026-10-05'
		});
	});

	it('keeps a club code, trimmed', () => {
		const result = eventInputSchema.safeParse({ ...valid, club: ' C-AAAA-1111 ' });
		expect(result.success && result.data.club).toBe('C-AAAA-1111');
	});

	it('accepts a one-day Event', () => {
		expect(eventInputSchema.safeParse({ ...valid, end_date: valid.start_date }).success).toBe(true);
	});

	function errors(input: Record<string, unknown>) {
		const result = eventInputSchema.safeParse(input);
		if (result.success) throw new Error('expected the input to be refused');
		return zodFieldErrors(result.error);
	}

	it('needs a name', () => {
		expect(errors({ ...valid, name: '   ' }).name).toEqual(["Enter the Event's name."]);
	});

	it(`allows ${EVENT_NAME_MAX} characters after trimming, and no more`, () => {
		const longest = 'a'.repeat(EVENT_NAME_MAX);
		expect(eventInputSchema.safeParse({ ...valid, name: ` ${longest} ` }).success).toBe(true);
		expect(errors({ ...valid, name: `${longest}a` }).name).toEqual([
			`Keep the name to ${EVENT_NAME_MAX} characters or fewer.`
		]);
	});

	it('needs a kind from the list', () => {
		expect(errors({ ...valid, kind: 'self_reported' }).kind).toEqual(['Choose the kind of Event.']);
	});

	it('needs an organizer', () => {
		expect(errors({ ...valid, organizer: '' }).organizer).toEqual(['Choose an organizer.']);
	});

	it('needs both dates', () => {
		const result = errors({ ...valid, start_date: '', end_date: '' });
		expect(result.start_date).toEqual(['Enter the start date.']);
		expect(result.end_date).toEqual(['Enter the end date.']);
	});

	it('refuses an end date before the start date, on the end date', () => {
		expect(errors({ ...valid, end_date: '2026-10-03' }).end_date).toEqual([
			'The end date cannot be before the start date.'
		]);
	});
});
