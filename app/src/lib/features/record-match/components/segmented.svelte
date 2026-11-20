<script lang="ts">
	import { RadioGroup, RadioGroupItem } from '#lib/ui/radio-group/index.js';

	let {
		name,
		label,
		options,
		value = $bindable()
	}: {
		/** Names the radio group, and the id its label uses. */
		name: string;
		label: string;
		options: readonly { value: string; label: string }[];
		value: string;
	} = $props();
</script>

<div class="grid gap-2">
	<span id="{name}-label" class="text-base leading-snug font-semibold text-secondary">
		{label}
	</span>
	<RadioGroup bind:value {name} orientation="horizontal" aria-labelledby="{name}-label">
		{#each options as option (option.value)}
			<RadioGroupItem value={option.value}>{option.label}</RadioGroupItem>
		{/each}
	</RadioGroup>
</div>
