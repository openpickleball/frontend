<script lang="ts">
	import type { Snippet } from 'svelte';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button, type ButtonSize, type ButtonVariant } from '#lib/ui/button/index.js';
	import {
		Dialog,
		DialogClose,
		DialogContent,
		DialogTitle,
		DialogTrigger
	} from '#lib/ui/dialog/index.js';
	import { NEW_TAB } from '#lib/ui/legal.js';
	import { Spinner } from '#lib/ui/spinner/index.js';
	import {
		FEEDBACK_EMBED_URL,
		FEEDBACK_ORIGIN,
		FEEDBACK_PAGE_URL,
		FEEDBACK_SANDBOX,
		FEEDBACK_TIMEOUT_MS,
		isFormLoaded
	} from './feedback.js';

	/**
	 * "Send feedback": a button that opens the Tally feedback form in a dialog. The iframe is only
	 * in the page while the dialog is open, so Tally hears nothing until the player opens it.
	 */
	let {
		variant = 'outline',
		size = 'sm',
		icon = false,
		class: className,
		formUrl = FEEDBACK_EMBED_URL,
		timeout = FEEDBACK_TIMEOUT_MS,
		trigger
	}: {
		variant?: ButtonVariant;
		size?: ButtonSize;
		/** Show the message icon before the label, as in the side nav. */
		icon?: boolean;
		class?: string;
		/** The iframe address. Tests pass a blank page, so they never reach Tally. */
		formUrl?: string;
		/** How long to wait for the form before showing the new-tab link. */
		timeout?: number;
		/**
		 * Render the opener yourself, such as Profile's settings row. Spread `props` on a button.
		 * Without it, the opener is a "Send feedback" button.
		 */
		trigger?: Snippet<[{ props: Record<string, unknown> }]>;
	} = $props();

	let open = $state(false);
	let status = $state<'loading' | 'ready' | 'failed'>('loading');
	let frame = $state<HTMLIFrameElement | null>(null);

	// Each time the dialog opens: start over, wait for Tally to say the form is there, and give up
	// when the device is offline or the form takes too long.
	$effect(() => {
		if (!open) return;
		status = navigator.onLine ? 'loading' : 'failed';
		const fail = () => {
			if (status === 'loading') status = 'failed';
		};
		const onMessage = (event: MessageEvent) => {
			if (event.origin !== FEEDBACK_ORIGIN || event.source !== frame?.contentWindow) return;
			if (isFormLoaded(event.data) && status === 'loading') status = 'ready';
		};
		const timer = setTimeout(fail, timeout);
		window.addEventListener('message', onMessage);
		window.addEventListener('offline', fail);
		return () => {
			clearTimeout(timer);
			window.removeEventListener('message', onMessage);
			window.removeEventListener('offline', fail);
		};
	});
</script>

<Dialog bind:open>
	<DialogTrigger>
		{#snippet child({ props })}
			{#if trigger}
				{@render trigger({ props })}
			{:else}
				<Button {...props} {variant} {size} class={className}>
					{#if icon}<MessageSquareTextIcon aria-hidden="true" />{/if}
					Send feedback
				</Button>
			{/if}
		{/snippet}
	</DialogTrigger>
	<!--
		Like the site's Tally popup: a white panel with the form filling it and a close button in the
		corner. Centered on every screen, with 16px either side on a phone. The panel is white in both
		themes. Our text and focus ring use the secondary and muted tokens, which are already resolved
		for the page's theme (white in black), so the panel points them at Tailwind's neutral-900 and
		neutral-600 to stay readable on white. `scheme-light` keeps native parts, such as a scrollbar,
		light too. The 16px strip at the top keeps the close button clear of the form's heading.
	-->
	<!-- eslint-disable local/no-arbitrary-tailwind-values -- 500px matches the site's Tally popup width; the height leaves 16px above and below -->
	<DialogContent
		class="inset-x-4 top-1/2 bottom-auto max-h-[calc(100svh-2rem)] -translate-y-1/2 gap-0 overflow-y-auto rounded-md border-0 bg-white p-0 pt-4 scheme-light [--color-muted:var(--color-neutral-600)] [--color-secondary:var(--color-neutral-900)] md:max-w-[500px] md:border-0 md:p-0 md:pt-4"
	>
		<!-- eslint-enable local/no-arbitrary-tailwind-values -->
		<DialogTitle class="sr-only">Send feedback</DialogTitle>
		<DialogClose>
			{#snippet child({ props })}
				<Button
					{...props}
					variant="ghost"
					size="icon"
					class="absolute top-1 right-1 z-10"
					aria-label="Close"
				>
					<XIcon aria-hidden="true" class="size-5" />
				</Button>
			{/snippet}
		</DialogClose>
		{#if status === 'failed'}
			<p class="px-6 py-8 text-base text-muted" data-testid="feedback-fallback">
				The form didn't load. Check your connection, or
				<Button
					variant="link"
					size="inline"
					href={FEEDBACK_PAGE_URL}
					target="_blank"
					rel="noopener"
				>
					open the form in a new tab<span class="sr-only">{NEW_TAB}</span>
				</Button>.
			</p>
		{:else}
			<div class="relative">
				<iframe
					bind:this={frame}
					src={formUrl}
					title="Feedback form"
					referrerpolicy="no-referrer"
					sandbox={FEEDBACK_SANDBOX}
					class={['block h-72 w-full', status === 'loading' && 'invisible']}
				></iframe>
				{#if status === 'loading'}
					<p
						role="status"
						class="absolute inset-0 flex items-center justify-center gap-2.5 text-muted"
					>
						<Spinner />
						Loading the form
					</p>
				{/if}
			</div>
		{/if}
	</DialogContent>
</Dialog>
