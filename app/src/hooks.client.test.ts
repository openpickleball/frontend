import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const startMocks = vi.fn();
const registerServiceWorker = vi.fn();
const shouldRegister = vi.fn();
const toast = vi.fn();

/** Load `init` fresh, with `PUBLIC_API_MOCK` and the dev flag set as given. */
async function loadInit(mock: string, dev = false) {
	vi.resetModules();
	vi.doMock('$app/env/public', () => ({ PUBLIC_API_MOCK: mock }));
	vi.doMock('$app/env', () => ({ dev }));
	vi.doMock('$app/paths', () => ({ asset: (path: string) => `/base${path}` }));
	vi.doMock('svelte-sonner', () => ({ toast }));
	vi.doMock('./lib/mocks/browser', () => ({ startMocks }));
	vi.doMock('./pwa/register', () => ({ registerServiceWorker, shouldRegister }));
	return (await import('./hooks.client')).init;
}

beforeEach(() => {
	vi.stubGlobal('navigator', { serviceWorker: {} });
	registerServiceWorker.mockResolvedValue(undefined);
	startMocks.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	startMocks.mockReset();
	registerServiceWorker.mockReset();
	shouldRegister.mockReset();
	toast.mockReset();
});

describe('client init', () => {
	it('registers the app shell worker when the API mock is off', async () => {
		shouldRegister.mockReturnValue(true);
		const init = await loadInit('off');
		await init();

		expect(shouldRegister).toHaveBeenCalledWith({ dev: false, supported: true });
		expect(registerServiceWorker).toHaveBeenCalledOnce();
		expect(startMocks).not.toHaveBeenCalled();
	});

	it('does not register when the worker rules say no', async () => {
		shouldRegister.mockReturnValue(false);
		const init = await loadInit('off', true);
		await init();
		expect(registerServiceWorker).not.toHaveBeenCalled();
		expect(startMocks).not.toHaveBeenCalled();
	});

	it('does not wait for the worker, and logs when it fails to start', async () => {
		shouldRegister.mockReturnValue(true);
		const failure = new Error('no worker');
		registerServiceWorker.mockRejectedValue(failure);
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const init = await loadInit('off');
		await expect(init()).resolves.toBeUndefined();

		await vi.waitFor(() => expect(log).toHaveBeenCalledWith(expect.any(String), failure));
	});

	it('offers a reload when an update is ready, and reloads on the action', async () => {
		shouldRegister.mockReturnValue(true);
		const init = await loadInit('off');
		await init();
		const offerUpdate = registerServiceWorker.mock.calls[0][0] as (apply: () => void) => void;
		const apply = vi.fn();
		offerUpdate(apply);

		expect(toast).toHaveBeenCalledWith(
			'Update available',
			expect.objectContaining({ id: 'update-available', duration: Infinity })
		);
		toast.mock.calls[0][1].action.onClick();
		expect(apply).toHaveBeenCalledOnce();
	});

	it.each(['missing', 'all'])('starts the mocks in %s mode, with no shell worker', async (mode) => {
		const init = await loadInit(mode);
		await init();

		expect(startMocks).toHaveBeenCalledWith(mode, { workerUrl: '/basemockServiceWorker.js' });
		expect(registerServiceWorker).not.toHaveBeenCalled();
	});

	it('still starts the app, and says what to do, when the mocks fail to start', async () => {
		startMocks.mockRejectedValue(new Error('no service workers'));
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		const init = await loadInit('all');
		await expect(init()).resolves.toBeUndefined();

		expect(log).toHaveBeenCalledWith(
			expect.stringContaining('PUBLIC_API_MOCK=all is set'),
			expect.any(Error)
		);
	});
});
