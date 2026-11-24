<script lang="ts">
	import { onDestroy } from 'svelte';
	import type { CityInput } from '#lib/domain/index.js';
	import { PlaceSearch } from '#lib/features/places/index.js';
	import * as Combobox from '#lib/ui/combobox/index.js';
	import { Field, FieldError, FieldLabel, fieldA11y } from '#lib/ui/field/index.js';
	import { Input } from '#lib/ui/input/index.js';

	let {
		id,
		label,
		value = $bindable({ text: '', chosen: null }),
		error = '',
		locked = false,
		places = new PlaceSearch(),
		onchange
	}: {
		id: string;
		label: string;
		/** The typed text, and the suggestion picked for it, if any. */
		value?: CityInput;
		/** A message for this field. Empty means the field is fine. */
		error?: string;
		/** Before the age check passes: disabled, and never asks for suggestions. */
		locked?: boolean;
		/** The suggestions. Tests pass one with a stand-in search. */
		places?: PlaceSearch;
		/** Called with every new value. */
		onchange?: (next: CityInput) => void;
	} = $props();

	const a11y = $derived(fieldA11y({ id, error }));
	onDestroy(() => places.clear());

	/** Whether the player wants the list open: they typed, and Escape or a pick has not closed it. */
	let wanted = $state(false);
	const showList = $derived(wanted && !locked && places.items.length > 0);
	/** Why there are no suggestions, when the search failed. A field error takes its place. */
	const note = $derived(error ? '' : places.message);

	function set(next: CityInput) {
		value = next;
		onchange?.(next);
	}

	function oninput(event: Event) {
		const text = (event.currentTarget as HTMLInputElement).value;
		// Any edit forgets the picked place: only a place from the list is sent.
		set({ text, chosen: null });
		if (locked) return;
		places.query(text);
		wanted = true;
	}

	function pick(label: string) {
		const place = places.items.find((item) => item.label === label);
		if (!place) return;
		set({ text: place.label, chosen: { city: place.city, region: place.region } });
		wanted = false;
		places.clear();
	}
</script>

<Field>
	<FieldLabel for={id}>{label}</FieldLabel>
	<Combobox.Root
		type="single"
		bind:open={() => showList, (open) => (wanted = open)}
		bind:value={() => (value.chosen ? value.text : ''), pick}
		inputValue={value.text}
	>
		<Combobox.Input {id} {oninput} disabled={locked} {...a11y.attrs} type="text" autocomplete="off">
			{#snippet child({ props })}
				<Input {...props} />
			{/snippet}
		</Combobox.Input>
		<Combobox.Content aria-label="City suggestions" avoidCollisions={false}>
			{#each places.items as place (place.label)}
				<Combobox.Item value={place.label} label={place.label}>{place.label}</Combobox.Item>
			{/each}
		</Combobox.Content>
	</Combobox.Root>
	{#if error}
		<FieldError id={a11y.errorId}>{error}</FieldError>
	{/if}
	{#if note}
		<p aria-hidden="true" class="text-sm text-muted">{note}</p>
	{/if}
	<!-- Always there, so a screen reader hears the message when it appears. -->
	<div role="status" aria-live="polite" class="sr-only">{note}</div>
</Field>
