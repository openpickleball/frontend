<script lang="ts">
	import { countMatches } from '#lib/features/matches/index.js';
	import { ProfileSettings, ProfileView } from '#lib/features/players/index.js';
	import {
		OrganizerMfaPrompt,
		SignOutButton,
		TwoFactorStatus,
		session
	} from '#lib/features/auth/index.js';
</script>

<svelte:head>
	<title>Profile · OPEN Pickleball</title>
</svelte:head>

<ProfileView {countMatches}>
	{#if session.isSignedIn}
		<ProfileSettings />
		<OrganizerMfaPrompt link />
		<TwoFactorStatus />
		<!-- From 1024px the side nav foot has Sign out, so it is not shown twice. -->
		<section class="border-t border-line pt-6 lg:hidden" aria-labelledby="account-heading">
			<h2 id="account-heading" class="label">Account</h2>
			<div class="mt-4 flex items-center justify-between gap-4">
				<span class="text-base text-muted">Sign out of OPEN on this device.</span>
				<SignOutButton />
			</div>
		</section>
	{/if}
</ProfileView>
