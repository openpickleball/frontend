<script lang="ts">
	import { Dialog as DialogPrimitive } from 'bits-ui';
	import { cn, type WithoutChildrenOrChild } from '#lib/ui/utils.js';
	import DialogOverlay from './dialog-overlay.svelte';
	import DialogPortal from './dialog-portal.svelte';
	import type { ComponentProps, Snippet } from 'svelte';

	// Restyled like ui/alert-dialog: a sheet at the bottom of the screen under 768px, a centered
	// dialog above. The close button is left out: every dialog here has its own Cancel.
	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		children,
		...restProps
	}: WithoutChildrenOrChild<DialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof DialogPortal>>;
		children: Snippet;
	} = $props();
</script>

<DialogPortal {...portalProps}>
	<DialogOverlay />
	<DialogPrimitive.Content
		bind:ref
		data-slot="dialog-content"
		class={cn(
			'fixed inset-x-0 bottom-0 z-50 grid gap-6 border-t border-line bg-primary px-gutter pt-8 pb-[calc(32px+env(safe-area-inset-bottom))] text-secondary outline-none data-[state=open]:animate-fade-in md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:border md:p-8',
			className
		)}
		{...restProps}
	>
		{@render children?.()}
	</DialogPrimitive.Content>
</DialogPortal>
