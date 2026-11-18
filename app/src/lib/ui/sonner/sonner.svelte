<script lang="ts">
	import { Toaster as Sonner, type ToasterProps as SonnerProps } from 'svelte-sonner';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import CircleCheckIcon from '@lucide/svelte/icons/circle-check';
	import OctagonXIcon from '@lucide/svelte/icons/octagon-x';
	import InfoIcon from '@lucide/svelte/icons/info';
	import TriangleAlertIcon from '@lucide/svelte/icons/triangle-alert';

	let { ...restProps }: SonnerProps = $props();
</script>

<!--
  Toasts are inverted pills (secondary on primary). The tokens follow color-scheme on the root, so
  no theme prop is needed. On mobile the offset keeps them above the bottom tab bar.
-->
<Sonner
	class="toaster group"
	position="bottom-center"
	mobileOffset={{ bottom: 'calc(var(--tabbar-height) + 16px + env(safe-area-inset-bottom))' }}
	style="--normal-bg: var(--color-secondary); --normal-text: var(--color-primary); --normal-border: var(--color-secondary); --border-radius: 999px;"
	toastOptions={{
		classes: {
			toast: 'font-body! text-[15px]! font-medium!'
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
