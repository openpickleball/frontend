<script lang="ts">
	import { countMatches } from '#lib/features/matches/index.js';
	import { ProfileSettings, ProfileView } from '#lib/features/players/index.js';
	import { SignOutButton, session } from '#lib/features/auth/index.js';
	import { Section } from '#lib/ui/section/index.js';
</script>

<svelte:head>
	<title>Profile · OPEN Pickleball</title>
</svelte:head>

<ProfileView {countMatches}>
	{#if session.isSignedIn}
		<ProfileSettings />
		<!-- From 1024px the side nav foot has Sign out, so it is not shown twice. -->
		<Section title="Account" class="lg:hidden">
			<div class="flex items-center justify-between gap-4">
				<span class="text-base text-muted">Sign out of OPEN on this device.</span>
				<SignOutButton />
			</div>
		</Section>
	{/if}
</ProfileView>
