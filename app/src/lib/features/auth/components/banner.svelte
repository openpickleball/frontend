<script lang="ts">
	let {
		kind,
		title,
		detail = ''
	}: {
		kind: 'error' | 'success';
		title: string;
		detail?: string;
	} = $props();
</script>

<!-- An error is announced as soon as it appears. A success is a polite status. -->
<div
	role={kind === 'error' ? 'alert' : 'status'}
	class={[
		'flex items-start gap-3 border-l-[3px] px-4 py-3.5 text-[15px]',
		kind === 'error'
			? 'border-danger bg-danger-wash text-secondary [&_svg]:text-danger'
			: 'border-confirmed bg-confirmed-wash text-secondary [&_svg]:text-confirmed'
	]}
>
	<svg
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		stroke-width="1.75"
		stroke-linecap="round"
		stroke-linejoin="round"
		aria-hidden="true"
		class="mt-0.5 size-5 shrink-0"
	>
		<circle cx="12" cy="12" r="8.75" />
		{#if kind === 'error'}
			<path d="M12 7.5v5.5" />
			<circle cx="12" cy="16.25" r="0.75" fill="currentColor" />
		{:else}
			<path d="m8 12.25 2.75 2.75L16 9.5" />
		{/if}
	</svg>
	<div class="grid gap-1">
		<strong class="font-semibold">{title}</strong>
		{#if detail}
			<p class="text-muted">{detail}</p>
		{/if}
	</div>
</div>
