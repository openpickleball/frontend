<script lang="ts">
	import { untrack } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
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

	// Load on open, and again when a new code is ready: a player created on this page (after a 404
	// from me/player) has settings from then on. A reload of the same code asks only once.
	const created = $derived(myCode.status === 'ready' ? myCode.code : null);
	let loadedFor: PlayerCode | null | undefined;
	$effect(() => {
		const code = created;
		untrack(() => {
			if (loadedFor !== undefined && (code === null || code === loadedFor)) return;
			loadedFor = code;
			void settings.load();
		});
	});

	// While the player is being created, or was refused, there are no settings to offer yet.
	const hidden = $derived(myCode.status === 'needs-details' || myCode.status === 'refused');

	async function saveName(raw: string) {
		const result = await settings.saveName(raw);
		if (result.ok) myCode.rename(result.value);
		return result;
	}
</script>

{#if !hidden}
	<section class="border-t border-line pt-6" aria-labelledby="settings-heading">
		<h2 id="settings-heading" class="label">Name and privacy</h2>
		<div class="mt-4">
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
	</section>
{/if}

<section class="border-t border-line pt-6" aria-labelledby="data-heading">
	<h2 id="data-heading" class="label">Your data</h2>
	<p class="mt-4 max-w-md text-base text-muted">
		You can always get a copy of your data. A download in the app is not ready yet. Until then,
		email
		<Button variant="link" size="inline" href="mailto:info@openpb.org">info@openpb.org</Button>
		to ask for it.
	</p>
</section>
