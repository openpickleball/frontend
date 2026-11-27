<script lang="ts">
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { tick } from 'svelte';
	import { GENDER_OPTIONS, MONTHS } from '#lib/domain/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		FieldError,
		FieldLegend,
		FieldSet,
		SelectField,
		TextField,
		fieldA11y
	} from '#lib/ui/field/index.js';
	import { RadioGroup, RadioGroupItem } from '#lib/ui/radio-group/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import { checkDetails, type DetailBody, type DetailValues } from './settings.js';

	let {
		onsubmit,
		errors = {},
		problem = null,
		id = 'details'
	}: {
		/** Send the checked details. The form is busy until it settles. */
		onsubmit: (body: DetailBody) => Promise<void> | void;
		/** The backend's message per field, from its last answer. */
		errors?: Record<string, string>;
		/** Why the last send failed, when no field explains it. */
		problem?: string | null;
		/** Prefix for element ids. */
		id?: string;
	} = $props();

	let values = $state<DetailValues>({
		birth_month: '',
		birth_year: '',
		gender_division: '',
		first_name: '',
		last_name: ''
	});
	/** The client check's messages, from the last submit. */
	let checked = $state<Partial<Record<keyof DetailValues, string>>>({});
	let busy = $state(false);
	/** False once the client check fails: the server's last answer is about older values. */
	let serverCurrent = $state(true);
	let form = $state<HTMLFormElement | null>(null);

	const shown = (name: keyof DetailValues): string =>
		checked[name] ?? (serverCurrent ? errors[name] : undefined) ?? '';
	const gender = $derived(
		fieldA11y({ id: `${id}-gender_division`, error: shown('gender_division') })
	);

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const result = checkDetails(values);
		if (!result.ok) {
			checked = result.errors;
			serverCurrent = false;
			await tick();
			form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
			return;
		}
		checked = {};
		serverCurrent = true;
		busy = true;
		try {
			await onsubmit(result.value);
		} finally {
			busy = false;
		}
		await tick();
		form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
	}
</script>

<!-- The details the backend needs to create a player when it holds none from sign-up. The same
	fields and look as sign-up's "About you" screen. -->
<form bind:this={form} method="post" onsubmit={submit} novalidate class="grid max-w-md gap-8">
	<FieldSet>
		<FieldLegend variant="label">Birth month and year</FieldLegend>
		<div class="grid grid-cols-2 items-start gap-4">
			<SelectField
				id="{id}-birth_month"
				name="birth_month"
				label="Month"
				placeholder="Month"
				options={MONTHS}
				autocomplete="bday-month"
				bind:value={values.birth_month}
				error={shown('birth_month')}
			/>
			<TextField
				id="{id}-birth_year"
				name="birth_year"
				label="Year"
				inputmode="numeric"
				autocomplete="bday-year"
				bind:value={values.birth_year}
				error={shown('birth_year')}
			/>
		</div>
	</FieldSet>
	<FieldSet>
		<FieldLegend id="{id}-gender_division-legend" variant="label">Gender</FieldLegend>
		<RadioGroup
			name="gender_division"
			orientation="horizontal"
			aria-labelledby="{id}-gender_division-legend"
			required
			{...gender.attrs}
			bind:value={values.gender_division}
		>
			{#each GENDER_OPTIONS as option, index (option.value)}
				<RadioGroupItem
					id={index === 0 ? `${id}-gender_division` : `${id}-gender_division-${option.value}`}
					value={option.value}
				>
					{option.label}
				</RadioGroupItem>
			{/each}
		</RadioGroup>
		{#if shown('gender_division')}
			<FieldError id={gender.errorId}>{shown('gender_division')}</FieldError>
		{/if}
	</FieldSet>
	<TextField
		id="{id}-first_name"
		name="first_name"
		label="First name"
		autocomplete="given-name"
		bind:value={values.first_name}
		error={shown('first_name')}
	/>
	<TextField
		id="{id}-last_name"
		name="last_name"
		label="Last name"
		autocomplete="family-name"
		bind:value={values.last_name}
		error={shown('last_name')}
	/>
	<div class="grid gap-4">
		<Button type="submit" aria-disabled={busy} aria-busy={busy} class="w-full">
			{#if busy}<Spinner />{/if}
			{busy ? 'Saving…' : 'Save and show my code'}
		</Button>
		{#if problem && serverCurrent}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{problem}</AlertTitle>
			</Alert>
		{/if}
	</div>
</form>
