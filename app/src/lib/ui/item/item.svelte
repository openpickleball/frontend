<script lang="ts" module>
	/**
	 * A row: full width, the text column on the left and the actions on the right. A link or
	 * button row dims on hover, like the ghost and link buttons, and shows the focus ring.
	 * `min-h-14` keeps every row a comfortable tap target, with or without a description.
	 */
	export const itemClass =
		'group/item flex min-h-14 w-full items-center gap-4 py-3 text-left text-base text-secondary outline-none transition-colors focus-visible:focus-ring [a]:hover:text-muted [button]:hover:text-muted';
</script>

<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		class: className,
		child,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> & {
		/** Render the row as another element, such as a link or a button, with these props. */
		child?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	const mergedProps = $derived({
		class: cn(itemClass, className),
		'data-slot': 'item',
		...restProps
	});
</script>

{#if child}
	{@render child({ props: mergedProps })}
{:else}
	<div bind:this={ref} {...mergedProps}>
		{@render mergedProps.children?.()}
	</div>
{/if}
