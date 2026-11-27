<script lang="ts" module>
	/** One term the popover explains, in a sentence or two. */
	export type InfoTerm = { term: string; text: string };
</script>

<script lang="ts">
	import InfoIcon from '@lucide/svelte/icons/info';
	import { Popover, PopoverContent, PopoverTrigger } from '#lib/ui/popover/index.js';
	import { cn } from '#lib/ui/utils.js';

	// Our own code, as thin as it goes: an info button that opens the shadcn-svelte Popover. Bits UI
	// opens it on a tap, a click, Enter or Space, closes it on Escape or a tap outside, and moves
	// focus in and back to the button. It never opens on hover: most players are on a phone.
	let {
		label,
		terms,
		class: className
	}: {
		/** The button's name, which says what it explains, such as "What does disputed mean?". */
		label: string;
		/** What the popover says: each term in bold, then its sentence or two. */
		terms: InfoTerm[];
		class?: string;
	} = $props();
</script>

<Popover>
	<!--
		A 44px tap target (size-11) around a 20px icon. The negative margins take the extra space back,
		so the button sits beside a heading without making its line taller or pushing it away.
	-->
	<PopoverTrigger
		aria-label={label}
		data-slot="info-button"
		class={cn(
			'-my-3 -mr-3 -ml-1 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted hover:text-secondary',
			className
		)}
	>
		<InfoIcon class="size-5" aria-hidden="true" />
	</PopoverTrigger>
	<PopoverContent role="dialog" aria-label={label}>
		<dl class="grid gap-4">
			{#each terms as item (item.term)}
				<div class="grid gap-1">
					<dt class="font-semibold">{item.term}</dt>
					<dd class="text-muted">{item.text}</dd>
				</div>
			{/each}
		</dl>
	</PopoverContent>
</Popover>
