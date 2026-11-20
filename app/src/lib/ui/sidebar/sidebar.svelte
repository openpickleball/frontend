<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<!--
	shadcn-svelte's Sidebar, kept to its fixed (collapsible="none") form. There is no Provider,
	so no open state, cookie, Cmd or Ctrl+B shortcut, or drawer on phones: the tab bar is the
	phone nav. Colors are the --color-sidebar-* aliases in src/routes/layout.css.
-->
<div
	bind:this={ref}
	data-slot="sidebar"
	data-sidebar="sidebar"
	class={cn('flex h-full w-64 flex-col bg-sidebar text-sidebar-foreground', className)}
	{...restProps}
>
	{@render children?.()}
</div>
