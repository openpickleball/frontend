<script lang="ts" module>
	import type { CityInput } from '#lib/domain/index.js';

	/** Everything the sign-up form holds, on both screens, as the player typed it. */
	export type SignupValues = {
		email: string;
		password: string;
		password_confirm: string;
		birth_month: string;
		birth_year: string;
		gender_division: string;
		first_name: string;
		last_name: string;
		city: CityInput;
		accepted_terms: boolean;
		accepted_privacy: boolean;
	};
</script>

<script lang="ts">
	import ChevronLeftIcon from '@lucide/svelte/icons/chevron-left';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import type { PlaceSearch } from '#lib/features/places/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { CardContent, CardFooter, CardHeader, CardTitle } from '#lib/ui/card/index.js';
	import {
		FieldDescription,
		FieldError,
		FieldLegend,
		FieldSet,
		fieldA11y
	} from '#lib/ui/field/index.js';
	import { NEW_TAB, PRIVACY_URL, TERMS_URL } from '#lib/ui/legal.js';
	import { RadioGroup, RadioGroupItem } from '#lib/ui/radio-group/index.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import type { FormProblem } from '../form.svelte.js';
	import LocationField from './location-field.svelte';
	import SelectField from './select-field.svelte';
	import TextField from './text-field.svelte';

	let {
		values = $bindable(),
		errors,
		problem,
		busy,
		agePassed,
		ageBusy,
		places,
		onback,
		oncheckage,
		onchangeage,
		oncreate
	}: {
		values: SignupValues;
		/** A message per field name. */
		errors: Record<string, string>;
		problem: FormProblem | null;
		/** Create account is waiting for the backend. */
		busy: boolean;
		/** The backend's age check passed: the birth fields lock and the rest opens. */
		agePassed: boolean;
		/** The age check is waiting for the backend. */
		ageBusy: boolean;
		places?: PlaceSearch;
		onback: () => void;
		oncheckage: () => void;
		onchangeage: () => void;
		oncreate: (event: SubmitEvent) => void;
	} = $props();

	const MONTHS = [
		'January',
		'February',
		'March',
		'April',
		'May',
		'June',
		'July',
		'August',
		'September',
		'October',
		'November',
		'December'
	].map((label, index) => ({ value: String(index + 1), label }));

	const AGREEMENTS = [
		{ name: 'accepted_terms', page: 'Terms of Service', href: TERMS_URL },
		{ name: 'accepted_privacy', page: 'Privacy Policy', href: PRIVACY_URL }
	] as const;

	/** Enter in the year runs the age check, as the age Continue does, until it passes. */
	function checkOnEnter(event: KeyboardEvent) {
		if (event.key !== 'Enter' || event.isComposing || agePassed) return;
		event.preventDefault();
		oncheckage();
	}

	const gender = $derived(
		fieldA11y({ id: 'signup-gender_division', error: errors.gender_division })
	);
</script>

<!-- Screen 2 of sign-up: the age first, then the rest, locked until the age check passes. -->
<CardHeader>
	<div>
		<!-- Off while an answer is pending, so it lands on the screen that asked. -->
		<Button variant="link" onclick={onback} disabled={busy || ageBusy}>
			<ChevronLeftIcon aria-hidden="true" />
			Back
		</Button>
	</div>
	<div class="grid gap-1">
		<p class="text-sm text-muted">Step 2 of 2</p>
		<CardTitle level="h1" id="signup-title" tabindex={-1} class="outline-none">About you</CardTitle>
	</div>
</CardHeader>
<form method="post" onsubmit={oncreate} novalidate class="grid gap-8">
	<CardContent>
		<!-- Locked while the check runs too, so the age checked is the age shown. -->
		<FieldSet aria-describedby="signup-birth-hint" disabled={agePassed || ageBusy}>
			<FieldLegend variant="label">Birth month and year</FieldLegend>
			<FieldDescription id="signup-birth-hint">
				We only ask for the month and year.
			</FieldDescription>
			<div class="grid grid-cols-2 items-start gap-4">
				<SelectField
					id="signup-birth_month"
					name="birth_month"
					label="Month"
					placeholder="Month"
					options={MONTHS}
					autocomplete="bday-month"
					bind:value={values.birth_month}
					error={errors.birth_month}
				/>
				<TextField
					id="signup-birth_year"
					name="birth_year"
					label="Year"
					inputmode="numeric"
					autocomplete="bday-year"
					bind:value={values.birth_year}
					error={errors.birth_year}
					onkeydown={checkOnEnter}
				/>
			</div>
		</FieldSet>
		<div>
			{#if agePassed}
				<Button variant="link" onclick={onchangeage} disabled={busy}>Change</Button>
			{:else}
				<Button
					variant="outline"
					onclick={oncheckage}
					aria-disabled={ageBusy}
					aria-busy={ageBusy}
					class="w-full"
				>
					{#if ageBusy}<Spinner />{/if}
					{ageBusy ? 'Checking…' : 'Continue'}
				</Button>
			{/if}
		</div>
		<!-- An age check problem shows by its button, not under the locked Create account. -->
		{#if problem && !agePassed}
			<Alert variant="destructive">
				<CircleAlertIcon aria-hidden="true" />
				<AlertTitle>{problem.title}</AlertTitle>
			</Alert>
		{/if}
	</CardContent>
	<!-- A native fieldset disables every control in it until the age check passes. A convenience
	     only: the backend checks the age again on sign-up. -->
	<fieldset disabled={!agePassed} class="grid min-w-0 gap-8">
		<CardContent>
			<FieldSet>
				<FieldLegend id="signup-gender_division-legend" variant="label">Gender</FieldLegend>
				<RadioGroup
					name="gender_division"
					orientation="horizontal"
					aria-labelledby="signup-gender_division-legend"
					required
					{...gender.attrs}
					bind:value={values.gender_division}
				>
					<RadioGroupItem id="signup-gender_division" value="mens">Man</RadioGroupItem>
					<RadioGroupItem id="signup-gender_division-womens" value="womens">Woman</RadioGroupItem>
				</RadioGroup>
				{#if errors.gender_division}
					<FieldError id={gender.errorId}>{errors.gender_division}</FieldError>
				{/if}
			</FieldSet>
			<TextField
				id="signup-first_name"
				name="first_name"
				label="First name"
				autocomplete="given-name"
				bind:value={values.first_name}
				error={errors.first_name}
			/>
			<TextField
				id="signup-last_name"
				name="last_name"
				label="Last name"
				autocomplete="family-name"
				bind:value={values.last_name}
				error={errors.last_name}
			/>
			<LocationField
				id="signup-city"
				label="City (optional)"
				bind:value={values.city}
				error={errors.city}
				locked={!agePassed}
				{places}
			/>
			{#each AGREEMENTS as agreement (agreement.name)}
				{@const id = `signup-${agreement.name}`}
				{@const a11y = fieldA11y({ id, error: errors[agreement.name] })}
				<div class="grid gap-2">
					<label class="flex min-h-11 items-center gap-3 text-secondary">
						<input
							{id}
							type="checkbox"
							name={agreement.name}
							bind:checked={values[agreement.name]}
							{...a11y.attrs}
							class="size-5 shrink-0 accent-secondary"
						/>
						<span>
							I agree to the
							<!-- eslint-disable svelte/no-navigation-without-resolve -- a page on openpb.org, not in the app -->
							<a
								href={agreement.href}
								target="_blank"
								rel="noopener"
								class="underline underline-offset-4 hover:text-muted"
							>
								{agreement.page}<span class="sr-only">{NEW_TAB}</span>
							</a>
							<!-- eslint-enable svelte/no-navigation-without-resolve -->
						</span>
					</label>
					{#if errors[agreement.name]}
						<FieldError id={a11y.errorId}>{errors[agreement.name]}</FieldError>
					{/if}
				</div>
			{/each}
		</CardContent>
		<CardFooter>
			<Button type="submit" aria-disabled={busy} aria-busy={busy} class="w-full">
				{#if busy}<Spinner />{/if}
				{busy ? 'Creating account…' : 'Create account'}
			</Button>
			<!-- Below the button, so an error doesn't push the form down and move the button. -->
			{#if problem && agePassed}
				<Alert variant="destructive">
					<CircleAlertIcon aria-hidden="true" />
					<AlertTitle>{problem.title}</AlertTitle>
				</Alert>
			{/if}
		</CardFooter>
	</fieldset>
</form>
