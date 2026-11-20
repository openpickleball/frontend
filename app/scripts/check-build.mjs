// Checks that a PUBLIC_API_MOCK=off build ships no API mocks (frontend#57): no mockServiceWorker.js
// and no msw or mock fixture code in any file.
// Run: pnpm build && pnpm check:build   (or pass another build folder: node scripts/check-build.mjs out)
//
// A mock build (`missing` or `all`) fails this check on purpose. `pnpm e2e` covers those.
import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dir = join(root, process.argv[2] ?? 'build');

// Strings that only the mocks put in a build: msw itself, src/lib/mocks/browser.ts and
// src/lib/mocks/fixtures.ts. Update the fixture values here if they change there.
const MARKERS = [
	'mockServiceWorker',
	'setupWorker',
	'[MSW]',
	'__openMock',
	'mock-only-pass-1234',
	'player@example.com'
];
const TEXT = /\.(html|js|mjs|json|webmanifest|css|txt|map)$/;

let files;
try {
	files = await readdir(dir, { recursive: true, withFileTypes: true });
} catch {
	console.error(`No build in ${relative(root, dir) || '.'}. Run pnpm build first.`);
	process.exit(1);
}

const problems = [];
let checked = 0;
for (const file of files) {
	if (!file.isFile()) continue;
	const path = join(file.parentPath, file.name);
	const name = relative(dir, path);
	if (file.name === 'mockServiceWorker.js') problems.push(`${name}: the mock service worker`);
	if (!TEXT.test(file.name)) continue;
	checked++;
	const text = await readFile(path, 'utf8');
	for (const marker of MARKERS) {
		if (text.includes(marker)) problems.push(`${name}: contains "${marker}"`);
	}
}

if (problems.length) {
	console.error('This build ships API mock code. Was it built with PUBLIC_API_MOCK=off?');
	for (const problem of problems) console.error(`  ${problem}`);
	process.exit(1);
}
console.log(`No API mock code in ${relative(root, dir)} (${checked} files checked).`);
