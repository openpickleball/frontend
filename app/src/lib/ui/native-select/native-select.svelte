<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLSelectAttributes } from 'svelte/elements';

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLSelectAttributes, HTMLSelectElement> = $props();
</script>

<!-- A native select styled like Input: the pill, the field border and the invalid ring. -->
<div
	class={cn('group/native-select relative w-full has-[select:disabled]:opacity-50', className)}
	data-slot="native-select-wrapper"
>
	<select
		bind:value
		bind:this={ref}
		data-slot="native-select"
		class="h-12 w-full min-w-0 cursor-pointer appearance-none rounded-full border border-field bg-surface pr-12 pl-5 text-base text-secondary transition-colors hover:border-muted disabled:cursor-not-allowed aria-invalid:border-danger aria-invalid:ring-1 aria-invalid:ring-danger aria-invalid:ring-inset"
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDownIcon
		class="pointer-events-none absolute top-1/2 right-5 size-4 -translate-y-1/2 text-muted"
		aria-hidden="true"
		data-slot="native-select-icon"
	/>
</div>
