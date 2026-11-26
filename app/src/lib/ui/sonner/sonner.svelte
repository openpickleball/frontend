<script lang="ts">
	import { onMount } from 'svelte';
	import { WIDE_QUERY, toastPlacement } from './position.js';
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();

	// Below 1024px toasts sit above the tab bar. From 1024px they go bottom right.
	let wide = $state(false);
	onMount(() => {
		const query = window.matchMedia(WIDE_QUERY);
		const sync = () => (wide = query.matches);
		sync();
		query.addEventListener('change', sync);
		return () => query.removeEventListener('change', sync);
	});
	const placement = $derived(toastPlacement(wide));
</script>

<!--
  Toasts are inverted pills (secondary on primary). The tokens follow color-scheme on the root, so
  no theme prop is needed. See position.ts for where they go.
-->
<Sonner
	class="toaster group"
	position={placement.position}
	offset={placement.offset}
	mobileOffset={placement.mobileOffset}
	style="--normal-bg: var(--color-secondary); --normal-text: var(--color-primary); --normal-border: var(--color-secondary); --border-radius: 999px;"
	toastOptions={{
		classes: {
			toast: 'font-body! text-base! font-medium!',
			// Sonner paints the description a fixed gray (#3f3f3f), which is 1.7:1 on the dark
			// toast in the ivory theme. Inherit the toast's text token instead.
			description: 'text-inherit!'
		}
	}}
	{...restProps}
>
	{#snippet loadingIcon()}
		<LoaderCircleIcon class="size-4 animate-spin" />
	{/snippet}
	{#snippet successIcon()}
		<CircleCheckIcon class="size-4" />
	{/snippet}
	{#snippet errorIcon()}
		<OctagonXIcon class="size-4" />
	{/snippet}
	{#snippet infoIcon()}
		<InfoIcon class="size-4" />
	{/snippet}
	{#snippet warningIcon()}
		<TriangleAlertIcon class="size-4" />
	{/snippet}
</Sonner>
