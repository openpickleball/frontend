/**
 * The app's Zod. Import `z` from here, never from 'zod' (eslint.config.js enforces it).
 *
 * No JIT: Zod otherwise probes for eval with `new Function('')`, which the content security
 * policy (src/csp.ts) blocks and reports as a violation on every page. Setting it here, in the
 * only module that loads Zod, means it is set before any schema parses.
 */
import { z } from 'zod';

z.config({ jitless: true });

export { z };
