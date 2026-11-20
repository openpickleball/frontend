<script lang="ts">
	import { resolve } from '$app/paths';
	import type { AppErrorKind } from '#lib/api/index.js';
	import Notice from './notice.svelte';

	/**
	 * Why a list of matches did not load, in words that fit the cause. Only a lost connection asks
	 * the player to check it (a request that took too long counts as one). Too many requests asks
	 * the player to wait. A sign-in problem links to sign in, because trying again won't help.
	 */
	let { kind, onretry }: { kind: AppErrorKind | null; onretry: () => void } = $props();
</script>

{#if kind === 'network'}
	<Notice kind="offline" title="You're offline." {onretry}>
		Your matches need a connection. Check it, then try again.
	</Notice>
{:else if kind === 'throttled'}
	<Notice kind="error" title="Your matches didn't load." {onretry}>
		Too many requests in a short time. Wait a minute, then try again.
	</Notice>
{:else if kind === 'unauthenticated'}
	<Notice kind="error" title="You're not signed in.">
		<a href={resolve('/account/login')} class="font-semibold underline underline-offset-4"
			>Sign in</a
		> to see your matches.
	</Notice>
{:else}
	<Notice kind="error" title="Your matches didn't load." {onretry}>
		Something went wrong on our side. Wait a moment, then try again.
	</Notice>
{/if}
