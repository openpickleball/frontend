<script lang="ts">
	import PrivacySettings from './privacy-settings.svelte';
	import SettingsLoader from './settings-loader.svelte';
	import type { SettingsDeps } from './settings-store.svelte.js';

	/** The privacy switches on Profile > Profile visibility: who can see each detail. */
	let {
		deps = {},
		class: className
	}: {
		/** For tests. The page uses the real services. */
		deps?: Partial<SettingsDeps>;
		class?: string;
	} = $props();
</script>

<SettingsLoader {deps} class={className}>
	{#snippet children(settings)}
		{#if settings.privacy}
			<PrivacySettings
				privacy={settings.privacy}
				error={settings.privacyError}
				onchange={(key, visibility) => void settings.setVisibility(key, visibility)}
			/>
		{/if}
	{/snippet}
</SettingsLoader>
