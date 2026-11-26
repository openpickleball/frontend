import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import './schemas';

describe('zod config', () => {
	// Zod probes for eval with `new Function('')` unless it is jitless. The content security
	// policy (src/csp.ts) blocks eval, so the probe is a violation in every page.
	it('is jitless once the schemas load', () => {
		expect(z.config().jitless).toBe(true);
	});
});
