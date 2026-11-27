import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import CodeStrip from './code-strip.svelte';

// No Toaster is mounted here, so the toast call is what is checked.
vi.mock('svelte-sonner', () => ({ toast: vi.fn() }));

const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

type Fakes = { share?: unknown; writeText?: (text: string) => Promise<void> };

/** Put fakes on the real navigator. Stubbing the whole object breaks its methods. */
function fakeNavigator({ share, writeText }: Fakes) {
	Object.defineProperty(navigator, 'share', { value: share, configurable: true });
	Object.defineProperty(navigator, 'clipboard', {
		value: { writeText: writeText ?? (async () => {}) },
		configurable: true
	});
}

describe('CodeStrip', () => {
	afterEach(() => {
		vi.mocked(toast).mockClear();
		// Dropping the own property uncovers the browser's own again.
		Reflect.deleteProperty(navigator, 'share');
		Reflect.deleteProperty(navigator, 'clipboard');
	});

	it('shows the code and copies it', async () => {
		const writeText = vi.fn(async () => {});
		fakeNavigator({ writeText });
		const screen = await render(CodeStrip, { code: CODE });
		await expect.element(screen.getByTestId('my-code')).toHaveTextContent(CODE);
		await screen.getByRole('button', { name: 'Copy code' }).click();
		expect(writeText).toHaveBeenCalledWith(CODE);
		expect(toast).toHaveBeenCalledWith('Code copied');
	});

	it('puts the Copy icon on Copy code', async () => {
		fakeNavigator({});
		const screen = await render(CodeStrip, { code: CODE });
		const button = screen.getByRole('button', { name: 'Copy code' }).element();
		expect(button.querySelector('svg.lucide-copy')).not.toBeNull();
	});

	it('offers no Share, only Copy code', async () => {
		fakeNavigator({ share: vi.fn(async () => {}) });
		const screen = await render(CodeStrip, { code: CODE });
		await expect.element(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Share' })).not.toBeInTheDocument();
	});

	it('says so when copying fails', async () => {
		fakeNavigator({ writeText: async () => Promise.reject(new Error('denied')) });
		const screen = await render(CodeStrip, { code: CODE });
		await screen.getByRole('button', { name: 'Copy code' }).click();
		expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't copy/));
	});
});
