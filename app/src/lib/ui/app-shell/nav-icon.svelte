<script lang="ts">
	import type { NavIconName } from './nav.js';

	let { name, class: className }: { name: NavIconName; class?: string } = $props();
</script>

<svg
	class={className}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="1.5"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#if name === 'home'}
		<path d="M4 10.5 12 4l8 6.5V20h-5.5v-6h-5v6H4Z" />
	{:else if name === 'record'}
		<circle cx="12" cy="12" r="8.25" />
		<path d="M12 8.5v7M8.5 12h7" />
	{:else if name === 'matches'}
		<path d="M4 6.5h16M4 12h16M4 17.5h10" />
	{:else}
		<circle cx="12" cy="8.5" r="3.75" />
		<path d="M4.75 20c.8-3.6 3.7-5.75 7.25-5.75S18.45 16.4 19.25 20" />
	{/if}
</svg>
