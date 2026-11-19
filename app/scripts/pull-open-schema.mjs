// Copies the backend's committed OpenAPI document into the OPEN API snapshot.
// BACKEND_DIR is a backend checkout. A relative path resolves from the
// frontend repo root. The default is ../backend, next to this repo.
import { copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = resolve(appDir, '..');
const backendDir = resolve(repoRoot, process.env.BACKEND_DIR || '../backend');
const source = resolve(backendDir, 'openapi/openapi.json');

if (!existsSync(source)) {
	console.error(
		`Cannot find ${source}.\n` +
			'Check out the backend next to this repo, or set BACKEND_DIR to its path.\n' +
			'The backend must be recent enough to commit openapi/openapi.json.'
	);
	process.exit(1);
}

copyFileSync(source, resolve(appDir, 'src/lib/api/schema/open.json'));
console.log(`Copied ${source}`);
