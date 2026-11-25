<script lang="ts">
	import { onMount, untrack, type Snippet } from 'svelte';
	import { resolve } from '$app/paths';
	import { ROUTES } from '#lib/domain/index.js';
	import type { PlayerCode } from '#lib/domain/index.js';
	import { Button } from '#lib/ui/button/index.js';
	import { LoadingState } from '#lib/ui/loading-state/index.js';
	import { cn } from '#lib/ui/utils.js';
	import CodeEntry from './code-entry.svelte';
	import { myCode } from './my-code.svelte.js';
	import PlayerDetailsForm from './player-details-form.svelte';

	let {
		children,
		signedOut,
		loading = 'Loading…',
		errorText = "We can't reach the server. Check your connection and try again.",
		error,
		entryHeading,
		showChange = false,
		changeHeading,
		reloadOnOpen = false,
		fallbackClass
	}: {
		/** What to show once the player's own code is known. */
		children: Snippet<[PlayerCode]>;
		/** The line above the Sign in button when nobody is signed in. */
		signedOut: string;
		/** The status line while the code is being found. */
		loading?: string;
		/** The message when the server can't be reached. Ignored when `error` is set. */
		errorText?: string;
		/** Replaces the default error message. Call `retry` to look for the code again. */
		error?: Snippet<[retry: () => void]>;
		/** Heading of the first-time prompt. `CodeEntry` has its own default. */
		entryHeading?: string;
		/** Show the prompt, not `children`, while the player is changing a code from this device. */
		showChange?: boolean;
		/** With `showChange`: the prompt's heading while changing, plus a Cancel button. */
		changeHeading?: string;
		/**
		 * Ask the backend again each time the gate opens, even when the code is already known.
		 * Without it, the gate asks only when nothing has asked yet, and again after the layout
		 * resets the store on a sign-out or sign-in.
		 */
		reloadOnOpen?: boolean;
		/** Classes for every fallback (loading, signed out, prompt, default error), not `children`. */
		fallbackClass?: string;
	} = $props();

	onMount(() => {
		if (reloadOnOpen) void myCode.load();
	});

	$effect(() => {
		if (!reloadOnOpen && myCode.status === 'idle') untrack(() => void myCode.load());
	});

	const retry = () => void myCode.load();
	const changing = $derived(myCode.status === 'ready' && myCode.editing);
</script>

{#if myCode.status === 'idle' || myCode.status === 'loading'}
	<LoadingState label={loading} class={fallbackClass} />
{:else if myCode.status === 'signed-out'}
	<section class={cn(fallbackClass, 'grid justify-items-start gap-3')}>
		<p class="max-w-md text-muted">{signedOut}</p>
		<Button href={resolve(ROUTES.login)}>Sign in</Button>
	</section>
{:else if myCode.status === 'error'}
	{#if error}
		{@render error(retry)}
	{:else}
		<section class={cn(fallbackClass, 'grid gap-3')} role="alert">
			<p class="max-w-md text-danger">{errorText}</p>
			<div>
				<Button variant="outline" onclick={retry}>Try again</Button>
			</div>
		</section>
	{/if}
{:else if myCode.status === 'needs-details'}
	<section class={cn(fallbackClass, 'grid gap-8')} aria-labelledby="details-heading">
		<div class="grid gap-4">
			<h2 id="details-heading" class="text-2xl font-medium tracking-tight text-secondary">
				Finish your player profile
			</h2>
			<p class="max-w-md text-muted">
				We need your birth month and year, gender and a display name again. This can happen if you
				confirmed your email on another device.
			</p>
		</div>
		<PlayerDetailsForm
			errors={myCode.detailErrors}
			problem={myCode.detailProblem}
			onsubmit={(body) => myCode.submitDetails(body)}
		/>
	</section>
{:else if myCode.status === 'refused'}
	<section class={cn(fallbackClass, 'grid gap-4')}>
		<p class="max-w-md text-muted">We can't create a player profile with these details.</p>
	</section>
{:else if myCode.status === 'unverified'}
	<section class={cn(fallbackClass, 'grid justify-items-start gap-4')}>
		<p class="max-w-md text-muted">
			Your email address is not verified yet. Open the link in the email we sent you, then try
			again.
		</p>
		<Button variant="outline" onclick={retry}>Try again</Button>
	</section>
{:else if myCode.status === 'needs-entry' || !myCode.code || (showChange && changing)}
	<div class={fallbackClass}>
		{#if changing && changeHeading}
			<CodeEntry
				onsave={(code) => myCode.save(code)}
				oncancel={() => myCode.cancel()}
				heading={changeHeading}
			/>
		{:else}
			<CodeEntry onsave={(code) => myCode.save(code)} heading={entryHeading} />
		{/if}
	</div>
{:else}
	{@render children(myCode.code)}
{/if}
