<script lang="ts">
	import { OwnCodeGate, SettingsPage, VisibilitySettings } from '#lib/features/players/index.js';
	import { session } from '#lib/features/auth/index.js';
</script>

<svelte:head>
	<title>Profile visibility · OPEN Pickleball</title>
</svelte:head>

<SettingsPage title="Profile visibility">
	{#if session.isSignedIn}
		<!-- The settings belong to the player's code, so the gate finds it first. -->
		<OwnCodeGate
			fallbackClass="mt-8"
			loading="Loading your settings…"
			signedOut="Sign in to change who can see your profile."
			errorText="We can't reach the server, so we can't load your settings. Check your connection and try again."
		>
			<VisibilitySettings class="mt-8" />
		</OwnCodeGate>
	{/if}
</SettingsPage>
