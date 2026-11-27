<script lang="ts">
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import XIcon from '@lucide/svelte/icons/x';
	import { Button, type ButtonSize, type ButtonVariant } from '#lib/ui/button/index.js';
	import {
		Dialog,
		DialogClose,
		DialogContent,
		DialogDescription,
		DialogHeader,
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
		timeout = FEEDBACK_TIMEOUT_MS
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
			<Button {...props} {variant} {size} class={className}>
				{#if icon}<MessageSquareTextIcon aria-hidden="true" />{/if}
				Send feedback
			</Button>
		{/snippet}
	</DialogTrigger>
	<!-- Centered on every screen, like the site's Tally popup, with 16px either side on a phone. -->
	<!-- eslint-disable local/no-arbitrary-tailwind-values -- 500px matches the site's Tally popup width; the height leaves 16px above and below -->
	<DialogContent
		class="inset-x-4 top-1/2 bottom-auto max-h-[calc(100svh-2rem)] -translate-y-1/2 gap-4 overflow-y-auto border p-6 md:max-w-[500px] md:p-8"
	>
		<!-- eslint-enable local/no-arbitrary-tailwind-values -->
		<div class="flex items-start justify-between gap-4">
			<DialogHeader>
				<DialogTitle>Send feedback</DialogTitle>
				<DialogDescription class="text-base text-muted">
					Tell us what works and what doesn't. The form is run by Tally.
				</DialogDescription>
			</DialogHeader>
			<DialogClose>
				{#snippet child({ props })}
					<Button {...props} variant="ghost" size="icon" class="-mt-1 -mr-2" aria-label="Close">
						<XIcon aria-hidden="true" class="size-5" />
					</Button>
				{/snippet}
			</DialogClose>
		</div>
		{#if status === 'failed'}
			<p class="text-base text-muted" data-testid="feedback-fallback">
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
				<!-- Tally's form keeps its own white background in both themes, like the site's popup. -->
				<iframe
					bind:this={frame}
					src={formUrl}
					title="Feedback form"
					referrerpolicy="no-referrer"
					sandbox={FEEDBACK_SANDBOX}
					class={['block h-72 w-full', status === 'loading' && 'invisible']}
				></iframe>
				{#if status === 'loading'}
					<p role="status" class="absolute inset-0 flex items-center gap-2.5 text-muted">
						<Spinner />
						Loading the form
					</p>
				{/if}
			</div>
		{/if}
	</DialogContent>
</Dialog>
