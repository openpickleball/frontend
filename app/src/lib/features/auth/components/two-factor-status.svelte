<script lang="ts">
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { session } from '../session.svelte.js';

	/** The profile page's two-factor section: on or off, and a link to its settings. */
	const link = $derived(
		session.mfaEnrolled === true
			? 'Manage two-factor'
			: session.mfaEnrolled === false
				? 'Set up two-factor'
				: 'Two-factor settings'
	);
</script>

<section class="border-t border-line pt-6" aria-labelledby="two-factor-status-heading">
	<h2 id="two-factor-status-heading" class="label">Two-factor authentication</h2>
	<div class="mt-4 flex flex-wrap items-center justify-between gap-4">
		<p class="max-w-md text-base text-muted">
			{#if session.mfaEnrolled === true}
				On. Each sign-in asks for a code from your authenticator app.
			{:else if session.mfaEnrolled === false}
				Off. Add a code from an authenticator app to each sign-in.
			{:else}
				Ask for a code from an authenticator app each time you sign in.
			{/if}
		</p>
		<Button variant="outline" size="sm" href={resolve(ROUTES.twoFactor)}>{link}</Button>
	</div>
</section>
