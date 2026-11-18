<script lang="ts">
	import { cn, type WithElementRef } from '#lib/ui/utils.js';
	import type { HTMLInputAttributes, HTMLInputTypeAttribute } from 'svelte/elements';

	type InputType = Exclude<HTMLInputTypeAttribute, 'file'>;

	type Props = WithElementRef<
		Omit<HTMLInputAttributes, 'type'> &
			({ type: 'file'; files?: FileList | null } | { type?: InputType; files?: undefined })
	>;

	let {
		ref = $bindable(null),
		value = $bindable(),
		type,
		files = $bindable(),
		class: className,
		'data-slot': dataSlot = 'input',
		...restProps
	}: Props = $props();
</script>

{#if type === 'file'}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-12 w-full min-w-0 rounded-full border border-field bg-surface px-5 text-base text-secondary outline-none transition-colors placeholder:text-faint hover:border-muted focus-visible:border-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-45 file:border-0 file:bg-transparent file:text-sm file:font-medium',
			className
		)}
		type="file"
		bind:files
		bind:value
		{...restProps}
	/>
{:else}
	<input
		bind:this={ref}
		data-slot={dataSlot}
		class={cn(
			'h-12 w-full min-w-0 rounded-full border border-field bg-surface px-5 text-base text-secondary outline-none transition-colors placeholder:text-faint hover:border-muted focus-visible:border-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-secondary aria-invalid:border-danger aria-invalid:shadow-[inset_0_0_0_1px_var(--color-danger)] disabled:cursor-not-allowed disabled:opacity-45 file:border-0 file:bg-transparent file:text-sm file:font-medium',
			className
		)}
		{type}
		bind:value
		{...restProps}
	/>
{/if}
