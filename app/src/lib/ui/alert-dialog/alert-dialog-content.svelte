<script lang="ts">
	import { AlertDialog as AlertDialogPrimitive } from 'bits-ui';
	import { cn, type WithoutChild, type WithoutChildrenOrChild } from '#lib/ui/utils.js';
	import AlertDialogOverlay from './alert-dialog-overlay.svelte';
	import AlertDialogPortal from './alert-dialog-portal.svelte';
	import type { ComponentProps } from 'svelte';

	let {
		ref = $bindable(null),
		class: className,
		portalProps,
		onOpenAutoFocus = (event: Event) => focusCancel(event),
		...restProps
	}: WithoutChild<AlertDialogPrimitive.ContentProps> & {
		portalProps?: WithoutChildrenOrChild<ComponentProps<typeof AlertDialogPortal>>;
	} = $props();

	// Every dialog opens on Cancel (mockups/README.md). Callers can pass their own onOpenAutoFocus.
	function focusCancel(event: Event) {
		const cancel = ref?.querySelector('[data-alert-dialog-cancel]');
		if (!(cancel instanceof HTMLElement)) return;
		event.preventDefault();
		cancel.focus();
	}
</script>

<AlertDialogPortal {...portalProps}>
	<AlertDialogOverlay />
	<AlertDialogPrimitive.Content
		bind:ref
		data-slot="alert-dialog-content"
		{onOpenAutoFocus}
		class={cn(
			'group/alert-dialog-content fixed inset-x-0 bottom-0 z-50 grid gap-6 border-t border-line bg-primary px-gutter pt-8 pb-[calc(32px+env(safe-area-inset-bottom))] text-secondary outline-none data-[state=open]:animate-fade-in md:inset-auto md:top-1/2 md:left-1/2 md:w-full md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 md:border md:p-8',
			className
		)}
		{...restProps}
	/>
</AlertDialogPortal>
