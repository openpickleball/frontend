<script lang="ts">
	import CirclePlusIcon from '@lucide/svelte/icons/circle-plus';
	import HouseIcon from '@lucide/svelte/icons/house';
	import ListIcon from '@lucide/svelte/icons/list';
	import UserIcon from '@lucide/svelte/icons/user';
	import type { NavIconName } from './nav.js';

	let { name, class: className }: { name: NavIconName; class?: string } = $props();
</script>

{#if name === 'home'}
	<HouseIcon class={className} aria-hidden="true" />
{:else if name === 'record'}
	<CirclePlusIcon class={className} aria-hidden="true" />
{:else if name === 'matches'}
	<ListIcon class={className} aria-hidden="true" />
{:else}
	<UserIcon class={className} aria-hidden="true" />
{/if}
