import { test as base, expect } from '@playwright/test';

/**
 * Playwright's `test`, with an automatic check that the page broke no rule of the content
 * security policy (src/csp.ts). Every spec in e2e/, e2e-pwa/ and e2e-live/ imports `test` and
 * `expect` from here, so a policy that blocks something the app needs fails the suite.
 *
 * It watches the whole browser context: Chrome's console error that names the Content Security
 * Policy, and the `securitypolicyviolation` event, reported to the console by an init script
 * (init scripts are not subject to the page's policy).
 */
export const test = base.extend<{ cspViolations: string[] }>({
	cspViolations: [
		async ({ context }, use) => {
			const violations: string[] = [];
			context.on('console', (message) => {
				if (/Content Security Policy/i.test(message.text())) violations.push(message.text());
			});
			await context.addInitScript(() => {
				document.addEventListener('securitypolicyviolation', (event) => {
					console.error(
						`Content Security Policy violation: ${event.effectiveDirective} blocked ${event.blockedURI} at ${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`
					);
				});
			});
			await use(violations);
			// A round trip to each open page that waits one frame, so console messages and
			// violation events still on their way arrive before the check.
			for (const page of context.pages()) {
				if (page.isClosed()) continue;
				await page
					.evaluate(
						() =>
							new Promise<void>((resolve) => {
								requestAnimationFrame(() => resolve());
								// A page that is not painting gets no frame; do not wait forever.
								setTimeout(resolve, 1000);
							})
					)
					// The page closed or navigated away during the round trip: nothing left to wait for.
					.catch(() => undefined);
			}
			expect(violations, 'content security policy violations').toEqual([]);
		},
		{ auto: true }
	]
});

export { expect };
