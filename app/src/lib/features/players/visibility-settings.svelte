<script lang="ts">
	import { myCode } from './my-code.svelte.js';
	import PrivacySettings from './privacy-settings.svelte';
	import SettingsLoader from './settings-loader.svelte';
	import type { SettingsDeps, SettingsStore } from './settings-store.svelte.js';
	import type { Privacy, PrivacyKey } from './types.js';

	/**
	 * The privacy switches on Profile > Privacy: how the last name shows, and who can see each
	 * detail. A saved change shows the name the backend returns everywhere the app shows it.
	 */
	let {
		deps = {},
		class: className
	}: {
		/** For tests. The page uses the real services. */
		deps?: Partial<SettingsDeps>;
		class?: string;
	} = $props();

	async function change<K extends PrivacyKey>(settings: SettingsStore, key: K, value: Privacy[K]) {
		// The settings belong to the player whose code the gate holds now. The answer may arrive
		// after a sign-out, so the name goes only to that player.
		const code = myCode.code;
		if ((await settings.setPrivacy(key, value)) && code)
			myCode.showName(code, settings.displayName);
	}
</script>

<SettingsLoader {deps} class={className}>
	{#snippet children(settings)}
		{#if settings.privacy}
			<PrivacySettings
				privacy={settings.privacy}
				displayName={settings.displayName}
				nameLocked={settings.nameLocked}
				error={settings.privacyError}
				onchange={(key, value) => void change(settings, key, value)}
			/>
		{/if}
	{/snippet}
</SettingsLoader>
