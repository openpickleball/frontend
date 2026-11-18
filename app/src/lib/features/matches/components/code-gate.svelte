<script lang="ts">
	import { untrack, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { CodeEntry, myCode } from '#lib/features/players/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import Notice from './notice.svelte';

	let { children }: { children: Snippet<[PlayerCode]> } = $props();

	// Find the player's own OPEN code, which every match call needs. The effect also covers a
	// sign-out and sign-in on the same page: the layout resets the store, and this loads it again.
	$effect(() => {
		if (myCode.status === 'idle') untrack(() => void myCode.load());
	});
</script>

{#if myCode.status === 'ready' && myCode.code}
	{@render children(myCode.code)}
{:else if myCode.status === 'needs-entry'}
	<div class="mt-8">
		<CodeEntry
			onsave={(code) => myCode.save(code)}
			heading="Enter your OPEN code to see your matches"
		/>
	</div>
{:else if myCode.status === 'signed-out'}
	<section class="mt-8 grid justify-items-start gap-3">
		<p class="max-w-[44ch] text-muted">Sign in to see your matches.</p>
		<Button href={resolve('/account/login')}>Sign in</Button>
	</section>
{:else if myCode.status === 'error'}
	<div class="mt-8">
		<Notice kind="error" title="We can't load your account." onretry={() => myCode.load()}>
			Check your connection, then try again.
		</Notice>
	</div>
{:else}
	<p class="mt-8 text-muted" role="status">Loading…</p>
{/if}
