import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from 'vitest-browser-svelte';
import { toast } from 'svelte-sonner';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import CodeCard from './code-card.svelte';

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

describe('CodeCard', () => {
	afterEach(() => {
		vi.mocked(toast).mockClear();
		// Dropping the own property uncovers the browser's own again.
		Reflect.deleteProperty(navigator, 'share');
		Reflect.deleteProperty(navigator, 'clipboard');
	});

	it('shows the code and copies it', async () => {
		const writeText = vi.fn(async () => {});
		fakeNavigator({ writeText });
		const screen = await render(CodeCard, { code: CODE });
		await expect.element(screen.getByTestId('my-code')).toHaveTextContent(CODE);
		await screen.getByRole('button', { name: 'Copy code' }).click();
		expect(writeText).toHaveBeenCalledWith(CODE);
		expect(toast).toHaveBeenCalledWith('Code copied');
	});

	it('puts the Copy icon on Copy code', async () => {
		fakeNavigator({});
		const screen = await render(CodeCard, { code: CODE });
		const button = screen.getByRole('button', { name: 'Copy code' }).element();
		expect(button.querySelector('svg.lucide-copy')).not.toBeNull();
	});

	it('shares through the share sheet when there is one', async () => {
		const share = vi.fn(async () => {});
		const writeText = vi.fn(async () => {});
		fakeNavigator({ share, writeText });
		const screen = await render(CodeCard, { code: CODE });
		await screen.getByRole('button', { name: 'Share' }).click();
		expect(share).toHaveBeenCalledOnce();
		expect(JSON.stringify(share.mock.calls[0])).toContain(CODE);
		expect(writeText).not.toHaveBeenCalled();
	});

	it('hides Share when there is no share sheet', async () => {
		fakeNavigator({ share: undefined });
		const screen = await render(CodeCard, { code: CODE });
		await expect.element(screen.getByRole('button', { name: 'Copy code' })).toBeVisible();
		await expect.element(screen.getByRole('button', { name: 'Share' })).not.toBeInTheDocument();
	});

	it('says so, without copying, when sharing fails for another reason', async () => {
		const writeText = vi.fn(async () => {});
		const share = vi.fn(async () => Promise.reject(new DOMException('no', 'NotAllowedError')));
		fakeNavigator({ share, writeText });
		const screen = await render(CodeCard, { code: CODE });
		await screen.getByRole('button', { name: 'Share' }).click();
		expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't share/));
		expect(writeText).not.toHaveBeenCalled();
	});

	it('does not copy, or complain, when the player closes the share sheet', async () => {
		const writeText = vi.fn(async () => {});
		const share = vi.fn(async () => Promise.reject(new DOMException('closed', 'AbortError')));
		fakeNavigator({ share, writeText });
		const screen = await render(CodeCard, { code: CODE });
		await screen.getByRole('button', { name: 'Share' }).click();
		expect(share).toHaveBeenCalledOnce();
		expect(writeText).not.toHaveBeenCalled();
		expect(toast).not.toHaveBeenCalled();
	});

	it('says so when copying fails', async () => {
		fakeNavigator({ writeText: async () => Promise.reject(new Error('denied')) });
		const screen = await render(CodeCard, { code: CODE });
		await screen.getByRole('button', { name: 'Copy code' }).click();
		expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Couldn't copy/));
	});
});
