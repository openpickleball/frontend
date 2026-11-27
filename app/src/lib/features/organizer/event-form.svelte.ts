/**
 * The state of the Event dialog, for a new Event or an existing one. Every error is keyed like
 * the backend's 422 fields (`name`, `start_date`), so a client check and a server answer land on
 * the same field. The client checks are a convenience: the backend checks again.
 *
 * A change sends only the fields that differ from the Event as it was (after trimming the name),
 * because the backend refuses a new name or date on an Event a match names, even for a change
 * that only meant to set the kind.
 */
import { isAppError, type ApiOption } from '#lib/api/index.js';
import {
	eventInputSchema,
	zodFieldErrors,
	type EventKind,
	type OrganizerEvent
} from '#lib/domain/index.js';
import type { OrganizerMembership } from '#lib/features/auth/index.js';
import { EVENT_FIELDS, eventErrorCopy, type EventField } from './copy.js';
import { createOrganizerEvent, updateOrganizerEvent, type EventChanges } from './services.js';

export type FormError = { message: string; twoFactorLink: boolean };

export type SubmitOutcome =
	| { kind: 'saved'; event: OrganizerEvent }
	/** An existing Event with nothing changed: no request was sent. */
	| { kind: 'unchanged' }
	/** A client check failed: no request was sent. */
	| { kind: 'invalid' }
	/** The backend refused it. `gone` is a 404: the Event or the authority is gone. */
	| { kind: 'failed'; gone: boolean };

export class EventForm {
	/** The Event being changed, or null for a new one. */
	readonly original: OrganizerEvent | null;
	/** The organizers a new Event can be for: the verified memberships. */
	readonly organizerChoices: readonly OrganizerMembership[];

	name = $state('');
	kind = $state<EventKind | ''>('');
	organizer = $state('');
	club = $state('');
	startDate = $state('');
	endDate = $state('');
	errors = $state<Partial<Record<EventField, string>>>({});
	formError = $state<FormError | null>(null);
	submitting = $state(false);

	private constructor(original: OrganizerEvent | null, choices: readonly OrganizerMembership[]) {
		this.original = original;
		this.organizerChoices = choices;
	}

	/** A new Event. The organizer is chosen for you when only one is verified. */
	static create(memberships: readonly OrganizerMembership[]): EventForm {
		const form = new EventForm(
			null,
			memberships.filter((m) => m.verified)
		);
		if (form.organizerChoices.length === 1) form.organizer = form.organizerChoices[0].organizer;
		return form;
	}

	/** An existing Event, filled from it. Its organizer and club can't change. */
	static edit(event: OrganizerEvent): EventForm {
		const form = new EventForm(event, []);
		form.name = event.name;
		form.kind = event.kind;
		form.organizer = event.organizer;
		form.club = event.club ?? '';
		form.startDate = event.startDate;
		form.endDate = event.endDate;
		return form;
	}

	get isEdit(): boolean {
		return this.original !== null;
	}

	/** The id of a field's input, for labels and focus. */
	static fieldId(field: EventField): string {
		return `event-${field}`;
	}

	/** Runs the client checks. Returns the create body, or null with `errors` set. */
	private parse() {
		const result = eventInputSchema.safeParse({
			name: this.name,
			kind: this.kind,
			organizer: this.organizer,
			club: this.original ? null : this.club,
			start_date: this.startDate,
			end_date: this.endDate
		});
		if (result.success) return result.data;
		const grouped = zodFieldErrors(result.error);
		const errors: Partial<Record<EventField, string>> = {};
		for (const field of EVENT_FIELDS) {
			const first = grouped[field]?.[0];
			if (first) errors[field] = first;
		}
		this.errors = errors;
		return null;
	}

	/** The fields that differ from the Event as it was. */
	private changes(body: { name: string; kind: EventKind; start_date: string; end_date: string }) {
		const original = this.original as OrganizerEvent;
		const changes: EventChanges = {};
		if (body.name !== original.name) changes.name = body.name;
		if (body.kind !== original.kind) changes.kind = body.kind;
		if (body.start_date !== original.startDate) changes.start_date = body.start_date;
		if (body.end_date !== original.endDate) changes.end_date = body.end_date;
		return changes;
	}

	/** Moves focus to the first field with an error, once the dialog has updated. */
	focusFirstError(): void {
		const field = EVENT_FIELDS.find((name) => this.errors[name]);
		if (!field || typeof document === 'undefined') return;
		queueMicrotask(() => document.getElementById(EventForm.fieldId(field))?.focus());
	}

	async submit(options: ApiOption = {}): Promise<SubmitOutcome> {
		if (this.submitting) return { kind: 'invalid' };
		this.errors = {};
		this.formError = null;
		const body = this.parse();
		if (!body) {
			this.focusFirstError();
			return { kind: 'invalid' };
		}
		const action = this.original ? 'edit' : 'create';
		const changes = this.original ? this.changes(body) : null;
		if (changes && Object.keys(changes).length === 0) return { kind: 'unchanged' };
		this.submitting = true;
		try {
			const event =
				this.original && changes
					? await updateOrganizerEvent(this.original.code, changes, options)
					: await createOrganizerEvent(body, options);
			return { kind: 'saved', event };
		} catch (error) {
			const copy = eventErrorCopy(error, action);
			this.errors = copy.fields;
			this.formError = copy.message
				? { message: copy.message, twoFactorLink: copy.twoFactorLink }
				: null;
			this.focusFirstError();
			return {
				kind: 'failed',
				gone: action === 'edit' && isAppError(error) && error.status === 404
			};
		} finally {
			this.submitting = false;
		}
	}
}
