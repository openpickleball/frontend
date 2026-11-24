<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import { PASSWORD_MIN_LENGTH, ROUTES, signupSchema } from '#lib/domain/index.js';
	import { Alert, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import {
		Card,
		CardContent,
		CardDescription,
		CardFooter,
		CardHeader,
		CardTitle
	} from '#lib/ui/card/index.js';
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
	import { isThrottled } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { session } from '../session.svelte.js';
	import { signup } from '../services.js';
	import CheckEmail from './check-email.svelte';
	import SelectField from './select-field.svelte';
	import TextField from './text-field.svelte';

	/** Called if the backend signs the player in straight away. Normally they check their email. */
	let { onsuccess }: { onsuccess: () => void } = $props();

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

	/** In page order, which is the order focus looks for the first error. */
	const FIELDS = [
		'birth_month',
		'birth_year',
		'gender_division',
		'email',
		'password',
		'password_confirm'
	];

	let birthMonth = $state('');
	let birthYear = $state('');
	let genderDivision = $state('');
	let email = $state('');
	let password = $state('');
	let passwordConfirm = $state('');
	const form = createAuthForm('signup', FIELDS);

	const gender = $derived(
		fieldA11y({ id: 'signup-gender_division', error: form.errors.gender_division })
	);

	function submit(event: SubmitEvent) {
		return form.submit(event, {
			parse: () =>
				signupSchema.safeParse({
					birth_month: birthMonth,
					birth_year: birthYear,
					gender_division: genderDivision,
					email,
					password,
					password_confirm: passwordConfirm
				}),
			run: async (data) => {
				// A new address and one that already has an account get the same answer, so the
				// screen never says which it was.
				const state = await signup(data);
				if (state.status === 'signed_in') onsuccess();
			},
			onError: (error, fields) => {
				// A refused sign-up has no field: its fixed message goes in the form alert.
				if (!isThrottled(error) && FIELDS.some((name) => fields[name])) {
					form.showFields(fields);
				} else {
					form.problem = { title: error.message };
				}
			}
		});
	}

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(
		session.status === 'pending_verification' ? 'Check your email' : 'Create account'
	);
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

{#if session.status === 'pending_verification'}
	<CheckEmail />
{:else}
	<Card aria-labelledby="signup-title">
		<CardHeader>
			<CardTitle level="h1" id="signup-title">Create account</CardTitle>
			<CardDescription>It's free. We'll send you a link to verify your email.</CardDescription>
		</CardHeader>
		<form method="post" onsubmit={submit} novalidate class="grid gap-8">
			<CardContent>
				<FieldSet aria-describedby="signup-birth-hint">
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
							bind:value={birthMonth}
							error={form.errors.birth_month}
						/>
						<TextField
							id="signup-birth_year"
							name="birth_year"
							label="Year"
							inputmode="numeric"
							autocomplete="bday-year"
							bind:value={birthYear}
							error={form.errors.birth_year}
						/>
					</div>
				</FieldSet>
				<FieldSet>
					<FieldLegend id="signup-gender_division-legend" variant="label">Gender</FieldLegend>
					<RadioGroup
						name="gender_division"
						orientation="horizontal"
						aria-labelledby="signup-gender_division-legend"
						required
						{...gender.attrs}
						bind:value={genderDivision}
					>
						<RadioGroupItem id="signup-gender_division" value="mens">Man</RadioGroupItem>
						<RadioGroupItem id="signup-gender_division-womens" value="womens">Woman</RadioGroupItem>
					</RadioGroup>
					{#if form.errors.gender_division}
						<FieldError id={gender.errorId}>{form.errors.gender_division}</FieldError>
					{/if}
				</FieldSet>
				<TextField
					id="signup-email"
					name="email"
					label="Email"
					type="email"
					autocomplete="email"
					placeholder="you@example.com"
					bind:value={email}
					error={form.errors.email}
				/>
				<TextField
					id="signup-password"
					name="password"
					label="Password"
					type="password"
					reveal
					autocomplete="new-password"
					hint="At least {PASSWORD_MIN_LENGTH} characters. Avoid one you use somewhere else."
					bind:value={password}
					error={form.errors.password}
				/>
				<TextField
					id="signup-password_confirm"
					name="password_confirm"
					label="Confirm password"
					type="password"
					reveal
					autocomplete="new-password"
					bind:value={passwordConfirm}
					error={form.errors.password_confirm}
				/>
			</CardContent>
			<CardFooter>
				<Button type="submit" aria-disabled={form.busy} aria-busy={form.busy} class="w-full">
					{#if form.busy}<Spinner />{/if}
					{form.busy ? 'Creating account…' : 'Create account'}
				</Button>
				<!-- eslint-disable svelte/no-navigation-without-resolve -- off-site openpb.org pages, resolve() is for app routes -->
				<p class="text-sm text-muted">
					By creating an account you agree to the
					<a
						href={TERMS_URL}
						target="_blank"
						rel="noopener"
						class="text-muted underline underline-offset-2 hover:text-secondary"
					>
						Terms of Service<span class="sr-only">{NEW_TAB}</span>
					</a>
					and
					<a
						href={PRIVACY_URL}
						target="_blank"
						rel="noopener"
						class="text-muted underline underline-offset-2 hover:text-secondary"
					>
						Privacy Policy<span class="sr-only">{NEW_TAB}</span>
					</a>.
				</p>
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
				<!-- Below the button, so an error doesn't push the form down and move the button. -->
				{#if form.problem}
					<Alert variant="destructive">
						<CircleAlertIcon aria-hidden="true" />
						<AlertTitle>{form.problem.title}</AlertTitle>
					</Alert>
				{/if}
				<p class="flex flex-wrap items-center gap-x-1 text-sm text-muted">
					Already have an account?
					<Button variant="link" href={resolve(ROUTES.login)} class="min-h-10 px-0 text-sm">
						Sign in
					</Button>
				</p>
			</CardFooter>
		</form>
	</Card>
{/if}
