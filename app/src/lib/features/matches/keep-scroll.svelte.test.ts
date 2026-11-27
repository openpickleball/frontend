import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';
import { snapshot } from '$app/navigation';
import { keepScroll } from './keep-scroll.svelte.js';

vi.mock('$app/navigation', () => ({ snapshot: vi.fn() }));

type Options = Parameters<typeof snapshot<number>>[0];

let scrollTo: ReturnType<typeof vi.spyOn>;
const readyState = $state({ value: false });
let options: Options;
let cleanup: () => void;

beforeEach(() => {
	vi.mocked(snapshot).mockImplementation((given) => {
		options = given as Options;
	});
	scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
	readyState.value = false;
	cleanup = $effect.root(() => keepScroll('test', () => readyState.value));
	flushSync();
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

describe('keepScroll', () => {
	it('keeps the scroll position under its id', () => {
		expect(options.id).toBe('test');
		expect(options.capture()).toBe(window.scrollY);
	});

	it('scrolls back once the list is ready, and only once', () => {
		options.restore(640);
		flushSync();
		expect(scrollTo).not.toHaveBeenCalled();

		readyState.value = true;
		flushSync();
		expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 640, behavior: 'instant' });

		readyState.value = false;
		flushSync();
		readyState.value = true;
		flushSync();
		expect(scrollTo).toHaveBeenCalledOnce();
	});

	it('scrolls back at once when the list is ready already', () => {
		readyState.value = true;
		flushSync();
		options.restore(320);
		flushSync();
		expect(scrollTo).toHaveBeenCalledExactlyOnceWith({ top: 320, behavior: 'instant' });
	});

	it('leaves a new visit where SvelteKit put it', () => {
		options.reset?.();
		readyState.value = true;
		flushSync();
		expect(scrollTo).not.toHaveBeenCalled();
	});
});
