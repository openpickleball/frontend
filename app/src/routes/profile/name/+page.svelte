<script lang="ts">
	import { NameSettings, OwnCodeGate, SettingsPage } from '#lib/features/players/index.js';
	import { session } from '#lib/features/auth/index.js';
</script>

<svelte:head>
	<title>Display name · OPEN Pickleball</title>
</svelte:head>

<SettingsPage title="Display name">
	{#if session.isSignedIn}
		<!-- The settings belong to the player's code, so the gate finds it first. -->
		<OwnCodeGate
			fallbackClass="mt-8"
			loading="Loading your settings…"
			signedOut="Sign in to change your display name."
			errorText="We can't reach the server, so we can't load your settings. Check your connection and try again."
		>
			<NameSettings class="mt-8" />
		</OwnCodeGate>
	{/if}
</SettingsPage>
