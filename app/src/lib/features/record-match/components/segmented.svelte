<script lang="ts">
	let {
		name,
		label,
		options,
		value = $bindable()
	}: {
		/** Names the radio group, and the ids the label uses. */
		name: string;
		label: string;
		options: readonly { value: string; label: string }[];
		value: string;
	} = $props();
</script>

<div class="grid gap-2">
	<span id="{name}-label" class="text-[15px] leading-snug font-semibold text-secondary">
		{label}
	</span>
	<div
		role="radiogroup"
		aria-labelledby="{name}-label"
		class="inline-flex w-fit max-w-full rounded-full border border-field p-1"
	>
		{#each options as option (option.value)}
			<label
				class="flex min-h-10 cursor-pointer items-center rounded-full px-5 text-[15px] font-semibold text-muted transition-colors select-none hover:text-secondary has-checked:bg-secondary has-checked:text-primary has-checked:hover:text-primary has-focus-visible:focus-ring"
			>
				<input type="radio" class="sr-only" {name} value={option.value} bind:group={value} />
				{option.label}
			</label>
		{/each}
	</div>
</div>
