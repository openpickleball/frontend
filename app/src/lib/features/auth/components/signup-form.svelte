<script lang="ts">
	import { tick } from 'svelte';
	import { signupAccountSchema, signupAgeSchema, signupSchema } from '#lib/domain/index.js';
	import { PlaceSearch } from '#lib/features/places/index.js';
	import { Card } from '#lib/ui/card/index.js';
	import { asAppError, issueMessages, serverMessages } from '../forms.js';
	import { createAuthForm } from '../form.svelte.js';
	import { session } from '../session.svelte.js';
	import { checkSignupAge, signup } from '../services.js';
	import CheckEmail from './check-email.svelte';
	import SignupAccountStep from './signup-account-step.svelte';
	import SignupDetailsStep, { type SignupValues } from './signup-details-step.svelte';

	let {
		onsuccess,
		places = new PlaceSearch()
	}: {
		/** Called if the backend signs the player in straight away. Normally they check their email. */
		onsuccess: () => void;
		/** City suggestions. Tests pass one with a stand-in search. */
		places?: PlaceSearch;
	} = $props();

	/** Screen 1's fields, in page order. */
	const ACCOUNT_FIELDS = ['email', 'password', 'password_confirm'];
	/** Screen 2's fields, in page order. Focus goes to the first one with an error. */
	const DETAILS_FIELDS = [
		'birth_month',
		'birth_year',
		'gender_division',
		'first_name',
		'last_name',
		'city',
		'accepted_terms',
		'accepted_privacy'
	];
	const BIRTH_FIELDS = ['birth_month', 'birth_year'];

	// One state for both screens, so every value survives Back and a server error.
	let values = $state<SignupValues>({
		email: '',
		password: '',
		password_confirm: '',
		birth_month: '',
		birth_year: '',
		gender_division: '',
		first_name: '',
		last_name: '',
		city: { text: '', chosen: null },
		accepted_terms: false,
		accepted_privacy: false
	});
	let step = $state<'account' | 'details'>('account');
	/**
	 * Whether the backend's age check passed for the birth month and year shown. A convenience
	 * that unlocks the rest of the form: the backend checks the age again on sign-up.
	 */
	let agePassed = $state(false);
	let ageBusy = $state(false);
	const form = createAuthForm('signup', [...ACCOUNT_FIELDS, ...DETAILS_FIELDS]);

	/** Show the screen and focus its heading, once the page has updated. */
	async function goTo(next: 'account' | 'details') {
		step = next;
		form.problem = null;
		await tick();
		document.getElementById('signup-title')?.focus();
	}

	/**
	 * Show field messages on the screen they belong to. An account field sends the player back to
	 * screen 1; a birth field unlocks the birth fields so it can be fixed.
	 */
	async function showFields(messages: Record<string, string>) {
		if (ACCOUNT_FIELDS.some((name) => messages[name]) && step !== 'account') {
			step = 'account';
			await tick();
		}
		if (BIRTH_FIELDS.some((name) => messages[name])) agePassed = false;
		await tick();
		form.showFields(messages);
	}

	function continueToDetails(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => signupAccountSchema.safeParse(values),
			run: () => goTo('details'),
			onError: () => {}
		});
	}

	async function checkAge() {
		if (ageBusy) return;
		form.problem = null;
		const parsed = signupAgeSchema.safeParse(values);
		if (!parsed.success) {
			form.showFields(issueMessages(parsed.error.issues));
			return;
		}
		ageBusy = true;
		try {
			await checkSignupAge(parsed.data);
			form.showFields({});
			// Only the values that were checked unlock the rest.
			const now = signupAgeSchema.safeParse(values);
			agePassed =
				now.success &&
				now.data.birth_month === parsed.data.birth_month &&
				now.data.birth_year === parsed.data.birth_year;
			if (!agePassed) return;
			await tick();
			document.getElementById('signup-gender_division')?.focus();
		} catch (cause) {
			const error = asAppError(cause);
			const fields = serverMessages(error);
			if (BIRTH_FIELDS.some((name) => fields[name])) {
				form.showFields(fields);
			} else {
				// A refusal has no field: its fixed message goes in the form alert.
				form.problem = { title: error.message };
			}
		} finally {
			ageBusy = false;
		}
	}

	async function changeAge() {
		agePassed = false;
		form.problem = null;
		await tick();
		document.getElementById('signup-birth_month')?.focus();
	}

	function createAccount(event: SubmitEvent) {
		return form.submit(event, {
			parse: () => signupSchema.safeParse(values),
			onInvalid: (messages) => {
				void showFields(messages);
				return true;
			},
			run: async (data) => {
				// A new address and one that already has an account get the same answer, so the
				// screen never says which it was.
				const state = await signup(data);
				// "Start over" from Check your email comes back to screen 1.
				step = 'account';
				if (state.status === 'signed_in') onsuccess();
			},
			onError: (error, fields) => {
				// The backend can name the region alone. It belongs to the City field.
				if (fields.region && !fields.city) fields.city = fields.region;
				if ([...ACCOUNT_FIELDS, ...DETAILS_FIELDS].some((name) => fields[name])) {
					void showFields(fields);
				} else {
					form.problem = { title: error.message };
				}
			}
		});
	}

	// The title follows the heading, so the tab and the history entry name the view.
	const title = $derived(
		session.status === 'pending_verification'
			? 'Check your email'
			: step === 'account'
				? 'Create account'
				: 'About you'
	);
</script>

<svelte:head>
	<title>{title} · OPEN Pickleball</title>
</svelte:head>

{#if session.status === 'pending_verification'}
	<CheckEmail />
{:else}
	<Card aria-labelledby="signup-title">
		{#if step === 'account'}
			<SignupAccountStep bind:values errors={form.errors} oncontinue={continueToDetails} />
		{:else}
			<SignupDetailsStep
				bind:values
				errors={form.errors}
				problem={form.problem}
				busy={form.busy}
				{agePassed}
				{ageBusy}
				{places}
				onback={() => goTo('account')}
				oncheckage={checkAge}
				onchangeage={changeAge}
				oncreate={createAccount}
			/>
		{/if}
	</Card>
{/if}
