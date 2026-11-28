<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { myCode } from './my-code.svelte.js';
	import { SettingsStore, type SettingsDeps } from './settings-store.svelte.js';

	/**
	 * Loads the player's settings (`GET me/player`) for the Privacy page, and shows the loading,
	 * error and not-available states. Renders `children` with the store once the settings are
	 * there.
	 */
	let {
		deps = {},
		class: className,
		children
	}: {
		/** For tests. The pages use the real services. */
		deps?: Partial<SettingsDeps>;
		class?: string;
		children: Snippet<[SettingsStore]>;
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
</script>

{#if shown}
	<div class={className} data-testid="settings">
		{#if settings.status === 'ready' && settings.privacy}
			{@render children(settings)}
		{:else if settings.status === 'unavailable'}
			<p class="max-w-md text-base text-muted">
				You can't change your privacy settings in the app yet.
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
{/if}
