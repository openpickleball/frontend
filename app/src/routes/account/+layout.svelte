<script lang="ts">
	import type { Snippet } from 'svelte';

	let { children }: { children: Snippet } = $props();
</script>

<!-- One centered card width for every account page, with room above on desktop. -->
<div data-testid="account-column" class="mx-auto w-full max-w-md pt-4 lg:pt-12">
	{@render children()}
</div>
