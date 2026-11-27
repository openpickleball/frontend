<script lang="ts">
	import { ProfileSettings, ProfileView, YourData } from '#lib/features/players/index.js';
	import { SignOutButton, TwoFactorStatus, session } from '#lib/features/auth/index.js';
	import { FeedbackButton } from '#lib/ui/feedback/index.js';
	import { Section } from '#lib/ui/section/index.js';
</script>

<svelte:head>
	<title>Profile · OPEN Pickleball</title>
</svelte:head>

<!-- The settings page: Name and privacy, Security, Your data, Feedback, then Account. -->
<ProfileView>
	{#if session.isSignedIn}
		<ProfileSettings />
		<TwoFactorStatus />
		<YourData />
		<!-- The way to the feedback form on a phone. From 1024px the side nav foot has it too. -->
		<Section title="Feedback">
			<div class="flex items-center justify-between gap-4">
				<span class="text-base text-muted">Tell us what works and what doesn't.</span>
				<FeedbackButton />
			</div>
		</Section>
		<!-- From 1024px the side nav foot has Sign out, so it is not shown twice. -->
		<Section title="Account" class="lg:hidden">
			<div class="flex items-center justify-between gap-4">
				<span class="text-base text-muted">Sign out of OPEN on this device.</span>
				<SignOutButton />
			</div>
		</Section>
	{/if}
</ProfileView>
