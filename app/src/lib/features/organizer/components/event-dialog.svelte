<script lang="ts">
	import { untrack } from 'svelte';
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import {
		EVENT_KINDS,
		EVENT_KIND_LABELS,
		ROUTES,
		type OrganizerEvent
	} from '#lib/domain/index.js';
	import { session } from '#lib/features/auth/index.js';
	import { Alert, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '#lib/ui/dialog/index.js';
	import { SelectField, TextField } from '#lib/ui/field/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import {
		CHOOSE_KIND,
		CHOOSE_ORGANIZER,
		EDIT_EVENT,
		FIXED_NOTE,
		KIND_NOTE,
		NEW_EVENT,
		NO_CLUB,
		TWO_FACTOR_LINK
	} from '../copy.js';
	import { EventForm } from '../event-form.svelte.js';
	import ClubField from './club-field.svelte';

	/**
	 * The dialog to create an Event (`event` null) or change one. A new Event is for one of the
	 * verified organizers. A change can't move the organizer or the club, which show as text.
	 */
	let {
		open = $bindable(false),
		event,
		onsaved,
		ongone
	}: {
		open?: boolean;
		event: OrganizerEvent | null;
		/** The Event as the backend saved it. */
		onsaved: (event: OrganizerEvent) => void;
		/** A change got 404: the Event or the authority to change it is gone. */
		ongone: () => void;
	} = $props();

	let form = $state(EventForm.create([]));
	// A fresh form each time the dialog opens, and only then: a later read of the memberships (after
	// a refusal, say) must not wipe what was typed or the refusal itself.
	$effect.pre(() => {
		if (!open) return;
		untrack(() => {
			form = event ? EventForm.edit(event) : EventForm.create(session.organizers ?? []);
		});
	});

	const id = (field: Parameters<typeof EventForm.fieldId>[0]) => EventForm.fieldId(field);
	const kinds = EVENT_KINDS.map((kind) => ({ value: kind, label: EVENT_KIND_LABELS[kind] }));
	const membership = $derived(session.organizers?.find((m) => m.organizer === form.organizer));
	const organizerName = $derived(membership?.name ?? form.organizer);

	async function submit(submitEvent: SubmitEvent) {
		submitEvent.preventDefault();
		const mine = form;
		const outcome = await mine.submit();
		// The dialog may have been closed by its owner and opened again since: then only a saved
		// Event goes back to the page, and the new form is left alone.
		const current = form === mine && open;
		if (outcome.kind === 'saved') {
			onsaved(outcome.event);
			if (current) open = false;
		} else if (outcome.kind === 'unchanged') {
			if (current) open = false;
		} else if (outcome.kind === 'failed' && outcome.gone) {
			ongone();
		}
	}

	/** No way out while a save is in flight: its answer belongs to this dialog. */
	function setOpen(next: boolean) {
		if (next || !form.submitting) open = next;
	}

	function holdWhileSaving(blocked: Event) {
		if (form.submitting) blocked.preventDefault();
	}

	function focusName(openEvent: Event) {
		openEvent.preventDefault();
		document.getElementById(id('name'))?.focus();
	}
</script>

<Dialog bind:open={() => open, setOpen}>
	<DialogContent
		onOpenAutoFocus={focusName}
		onEscapeKeydown={holdWhileSaving}
		onInteractOutside={holdWhileSaving}
	>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<DialogHeader>
				<DialogTitle>{form.isEdit ? EDIT_EVENT : NEW_EVENT}</DialogTitle>
				<DialogDescription>
					{form.isEdit ? FIXED_NOTE : 'An Event groups the matches you record for it.'}
				</DialogDescription>
			</DialogHeader>

			<div class="grid gap-4">
				<TextField
					id={id('name')}
					label="Name"
					autocomplete="off"
					bind:value={form.name}
					error={form.errors.name}
				/>
				<SelectField
					id={id('kind')}
					label="Kind"
					placeholder={CHOOSE_KIND}
					options={kinds}
					bind:value={form.kind}
					error={form.errors.kind}
					hint={form.isEdit ? KIND_NOTE : ''}
				/>
				{#if form.isEdit || form.organizerChoices.length === 1}
					<dl class="grid gap-1">
						<dt class="text-base font-semibold text-secondary">Organizer</dt>
						<dd class="text-base text-secondary">{organizerName}</dd>
					</dl>
				{:else}
					<SelectField
						id={id('organizer')}
						label="Organizer"
						placeholder={CHOOSE_ORGANIZER}
						options={form.organizerChoices.map((m) => ({ value: m.organizer, label: m.name }))}
						bind:value={form.organizer}
						error={form.errors.organizer}
					/>
				{/if}
				{#if form.isEdit}
					<dl class="grid gap-1">
						<dt class="text-base font-semibold text-secondary">Club</dt>
						<dd class="text-base text-secondary">{form.original?.club ?? NO_CLUB}</dd>
					</dl>
				{:else}
					<ClubField
						id={id('club')}
						organizer={form.organizer}
						admin={membership?.role === 'admin'}
						bind:value={form.club}
						error={form.errors.club}
					/>
				{/if}
				<TextField
					id={id('start_date')}
					label="Start date"
					type="date"
					bind:value={form.startDate}
					error={form.errors.start_date}
				/>
				<TextField
					id={id('end_date')}
					label="End date"
					type="date"
					bind:value={form.endDate}
					error={form.errors.end_date}
				/>
			</div>

			{#if form.formError}
				<Alert variant="destructive">
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>{form.formError.message}</AlertTitle>
					{#if form.formError.twoFactorLink}
						<AlertDescription>
							<Button variant="link" size="inline" href={resolve(ROUTES.twoFactor)}>
								{TWO_FACTOR_LINK}
							</Button>
						</AlertDescription>
					{/if}
				</Alert>
			{/if}

			<DialogFooter>
				<Button variant="outline" aria-disabled={form.submitting} onclick={() => setOpen(false)}>
					Cancel
				</Button>
				<Button type="submit" aria-disabled={form.submitting} aria-busy={form.submitting}>
					{#if form.submitting}<Spinner />{/if}
					{form.isEdit ? 'Save' : 'Create Event'}
				</Button>
			</DialogFooter>
		</form>
	</DialogContent>
</Dialog>
