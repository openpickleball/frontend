/** `PUBLIC_API_MOCK`: which requests the mocks answer. */
export const MOCK_MODES = ['off', 'missing', 'all'] as const;
export type MockMode = (typeof MOCK_MODES)[number];

/**
 * - `off`: no mocks, and no service worker.
 * - `missing`: only the endpoints the backend lacks. Everything else goes to the backend.
 * - `all`: every endpoint, so no backend is needed.
 *
 * Anything else counts as `off`, so a typo never turns mocks on in a real build.
 */
export function parseMockMode(value: unknown): MockMode {
	return MOCK_MODES.includes(value as MockMode) ? (value as MockMode) : 'off';
}
