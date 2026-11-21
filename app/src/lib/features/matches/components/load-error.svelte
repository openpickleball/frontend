<script lang="ts">
	import { resolve } from '$app/paths';
	import CircleAlertIcon from '@lucide/svelte/icons/circle-alert';
	import WifiOffIcon from '@lucide/svelte/icons/wifi-off';
	import { ROUTES } from '#lib/domain/index.js';
	import type { AppErrorKind } from '#lib/api/index.js';
	import { Alert, AlertAction, AlertDescription, AlertTitle } from '#lib/ui/alert/index.js';
	import { Button } from '#lib/ui/button/index.js';

	/**
	 * Why a list of matches did not load, in words that fit the cause. Only a lost connection asks
	 * the player to check it (a request that took too long counts as one). Too many requests asks
	 * the player to wait. A sign-in problem links to sign in, because trying again won't help.
	 */
	let { kind, onretry }: { kind: AppErrorKind | null; onretry: () => void } = $props();
</script>

{#snippet retry()}
	<AlertAction>
		<Button variant="outline" size="sm" onclick={onretry}>Try again</Button>
	</AlertAction>
{/snippet}

{#if kind === 'network'}
	<Alert>
		<WifiOffIcon aria-hidden="true" />
		<AlertTitle>You're offline.</AlertTitle>
		<AlertDescription>Your matches need a connection. Check it, then try again.</AlertDescription>
		{@render retry()}
	</Alert>
{:else if kind === 'throttled'}
	<Alert variant="destructive">
		<CircleAlertIcon aria-hidden="true" />
		<AlertTitle>Your matches didn't load.</AlertTitle>
		<AlertDescription>
			Too many requests in a short time. Wait a minute, then try again.
		</AlertDescription>
		{@render retry()}
	</Alert>
{:else if kind === 'unauthenticated'}
	<Alert variant="destructive">
		<CircleAlertIcon aria-hidden="true" />
		<AlertTitle>You're not signed in.</AlertTitle>
		<AlertDescription>
			<Button variant="link" size="inline" href={resolve(ROUTES.login)}>Sign in</Button> to see your matches.
		</AlertDescription>
	</Alert>
{:else}
	<Alert variant="destructive">
		<CircleAlertIcon aria-hidden="true" />
		<AlertTitle>Your matches didn't load.</AlertTitle>
		<AlertDescription>
			Something went wrong on our side. Wait a moment, then try again.
		</AlertDescription>
		{@render retry()}
	</Alert>
{/if}
