<script lang="ts" module>
	import { tv, type VariantProps } from 'tailwind-variants';

	// Restyled to the site: a full pill per item, and the one focus ring from layout.css.
	export const sidebarMenuButtonVariants = tv({
		base: 'peer/menu-button group/menu-button flex w-full items-center gap-3 overflow-hidden rounded-full text-left text-muted hover:text-sidebar-accent-foreground disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50 data-active:bg-sidebar-accent data-active:font-semibold data-active:text-sidebar-accent-foreground data-active:ring-1 data-active:ring-sidebar-border data-active:ring-inset [&_svg]:size-5 [&_svg]:shrink-0 [&>span:last-child]:truncate',
		variants: {
			size: {
				// 44px tall: 24px line plus py-2.5.
				default: 'px-3.5 py-2.5 text-base'
			}
		},
		defaultVariants: {
			size: 'default'
		}
	});

	export type SidebarMenuButtonSize = VariantProps<typeof sidebarMenuButtonVariants>['size'];
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	// No tooltip: it only shows on a collapsed sidebar, and this one never collapses.
	let {
		ref = $bindable(null),
		class: className,
		children,
		child,
		size = 'default',
		isActive = false,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLButtonElement>, HTMLButtonElement> & {
		isActive?: boolean;
		size?: SidebarMenuButtonSize;
		/** Render your own element, such as a link, with the button's props. */
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const buttonProps = $derived({
		class: cn(sidebarMenuButtonVariants({ size }), className),
		'data-slot': 'sidebar-menu-button',
		'data-sidebar': 'menu-button',
		'data-size': size,
		// Left out when false: the data-active: variant matches the attribute being there at all.
		'data-active': isActive || undefined,
		...restProps
	});
</script>

{#if child}
	{@render child({ props: buttonProps })}
{:else}
	<button bind:this={ref} {...buttonProps}>
		{@render children?.()}
	</button>
{/if}
