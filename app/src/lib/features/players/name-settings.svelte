<script lang="ts">
	import DisplayNameForm from './display-name-form.svelte';
	import { myCode } from './my-code.svelte.js';
	import SettingsLoader from './settings-loader.svelte';
	import type { SettingsDeps, SettingsStore } from './settings-store.svelte.js';

	/** The display name form on Profile > Display name. Saving a name updates `myCode`. */
	let {
		deps = {},
		class: className
	}: {
		/** For tests. The page uses the real services. */
		deps?: Partial<SettingsDeps>;
		class?: string;
	} = $props();

	async function saveName(settings: SettingsStore, raw: string) {
		const result = await settings.saveName(raw);
		if (result.ok) myCode.rename(result.value);
		return result;
	}
</script>

<SettingsLoader {deps} class={className}>
	{#snippet children(settings)}
		<DisplayNameForm name={settings.displayName} onsave={(raw) => saveName(settings, raw)} />
	{/snippet}
</SettingsLoader>
