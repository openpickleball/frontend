import { tick } from 'svelte';
import { browser } from '$app/environment';
import { afterNavigate, goto } from '$app/navigation';
import { page } from '$app/state';
import { isPlainClick, type Arrival, type BackTarget } from './back-link.js';

// Where each match page's back link went in this visit, by match code. A correction, or the link
// from a voided match to its correction, opens another match, and its back link goes there too.
// eslint-disable-next-line svelte/prefer-svelte-reactivity -- read once per navigation, never rendered
const origins = new Map<string, BackTarget>();

/** Where the back link of the match with this code went in this visit. */
export function rememberedOrigin(code: string): BackTarget | undefined {
	return origins.get(code);
}

/** Forget every remembered origin. For tests. */
export function resetOrigins() {
	origins.clear();
}

/**
 * A back link that knows where the player came from. Call it while a component initializes.
 *
 * `compute` works out the target from the navigation that opened the page. The target is kept
 * in `page.state` of the history entry, so it comes back when the player returns to the page with
 * the browser's back or forward button, or reloads it. `remember`, when given, names the match
 * whose origin this is.
 *
 * Put `current.href` on the link and `follow` on its click. A plain click goes back in history
 * when the target is the entry just before this one. Any other click opens `href`.
 */
export function backLink(
	fallback: () => BackTarget,
	compute: (arrival: Arrival) => BackTarget,
	remember?: () => string | null
) {
	// The target worked out for the navigation that opened the page, until it is saved.
	let computed = $state<BackTarget | null>(null);
	// The saved target is read from `page.state`, not in `afterNavigate`, because SvelteKit does
	// not always call `afterNavigate` when the browser's back or forward button opens the page.
	// The app renders in the browser only. Outside it, as in the route tests, there is no state.
	const current = $derived((browser ? page.state.backTo : undefined) ?? computed ?? fallback());

	$effect(() => {
		const code = remember?.();
		if (code) origins.set(code, current);
	});

	afterNavigate((navigation) => {
		// Saving the target below is a shallow navigation of its own.
		if (navigation.shallow || page.state.backTo) return;
		const next = compute(navigation);
		computed = next;
		// After this navigation has finished, so the save doesn't run inside it.
		void tick().then(() => {
			// Only while the page is still the one this target belongs to.
			if (page.url.href !== navigation.to?.url.href || page.state.backTo) return;
			// eslint-disable-next-line svelte/no-navigation-without-resolve -- the current address, unchanged
			void goto(page.url.href, {
				state: { ...page.state, backTo: next },
				shallow: true,
				replace: true,
				persistState: true
			});
		});
	});

	return {
		get current(): BackTarget {
			return current;
		},
		follow(event: MouseEvent) {
			if (!current.back || !isPlainClick(event)) return;
			event.preventDefault();
			history.back();
		}
	};
}
