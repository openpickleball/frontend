<script lang="ts" module>
	/**
	 * The section pattern: 12 above, a line, 4, the title, 4, the content. A form section is a
	 * FieldSet with these classes and a FieldLegend, so it looks like any other section.
	 */
	export const sectionClass = 'mt-12 border-t border-line pt-4';
</script>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLAttributes } from 'svelte/elements';
	import { cn, type WithElementRef } from '#lib/ui/utils.js';

	// Our own code: shadcn-svelte has no section with a heading. Its Card is a boxed panel.
	let {
		ref = $bindable(null),
		title,
		headingId,
		aside,
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLElement>> & {
		/** The h2 text. */
		title: string;
		/** The heading id, for links and focus. Generated when left out. */
		headingId?: string;
		/** Something next to the title, such as a count or a link. */
		aside?: Snippet;
	} = $props();

	const generatedId = $props.id();
	const id = $derived(headingId ?? `${generatedId}-title`);
</script>

<section
	bind:this={ref}
	data-slot="section"
	class={cn(sectionClass, className)}
	aria-labelledby={id}
	{...restProps}
>
	{#if aside}
		<div class="flex flex-wrap items-baseline justify-between gap-x-4">
			<h2 {id} class="section-title">{title}</h2>
			{@render aside()}
		</div>
	{:else}
		<h2 {id} class="section-title">{title}</h2>
	{/if}
	<div class="mt-4">
		{@render children?.()}
	</div>
</section>
