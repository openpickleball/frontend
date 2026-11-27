<script lang="ts">
	import { untrack } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { Section } from '#lib/ui/section/index.js';
	import DisplayNameForm from './display-name-form.svelte';
	import { myCode } from './my-code.svelte.js';
	import PrivacySettings from './privacy-settings.svelte';
	import { SettingsStore, type SettingsDeps } from './settings-store.svelte.js';

	let {
		deps = {}
	}: {
		/** For tests. The page uses the real services. */
		deps?: Partial<SettingsDeps>;
	} = $props();

	const settings = untrack(() => new SettingsStore(deps));

	// Load once the gate has the player's code, and again only for a different code (another
	// account). Until then there is nothing true to say about the settings: the player may still
	// be being found or created, or have no player at all.
	const ready = $derived(myCode.status === 'ready' ? myCode.code : null);
	let loadedFor = $state<PlayerCode | null>(null);
	$effect(() => {
		const code = ready;
		if (code === null) return;
		untrack(() => {
			if (code === loadedFor) return;
			loadedFor = code;
			void settings.load();
		});
	});

	// Shown for the code the settings belong to, and kept while the gate checks that code again.
	const shown = $derived(
		loadedFor !== null &&
			myCode.code === loadedFor &&
			(myCode.status === 'ready' || myCode.status === 'loading')
	);

	async function saveName(raw: string) {
		const result = await settings.saveName(raw);
		if (result.ok) myCode.rename(result.value);
		return result;
	}
</script>

{#if shown}
	<Section title="Name and privacy" headingId="settings-heading">
		<div>
			{#if settings.status === 'ready' && settings.privacy}
				<div class="grid gap-8">
					<DisplayNameForm name={settings.displayName} onsave={saveName} />
					<PrivacySettings
						privacy={settings.privacy}
						error={settings.privacyError}
						onchange={(key, visibility) => void settings.setVisibility(key, visibility)}
					/>
				</div>
			{:else if settings.status === 'unavailable'}
				<p class="max-w-md text-base text-muted">
					You can't change your display name or privacy settings in the app yet.
				</p>
			{:else if settings.status === 'error'}
				<p class="max-w-md text-base text-muted">
					We can't load your settings right now. Check your connection and try again.
				</p>
				<Button variant="outline" size="sm" class="mt-4" onclick={() => settings.load()}>
					Try again
				</Button>
			{:else}
				<LoadingState label="Loading your settings…" />
			{/if}
		</div>
	</Section>
{/if}
