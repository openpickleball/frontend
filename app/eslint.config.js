import boundaries from 'eslint-plugin-boundaries';
import js from '@eslint/js';
import local from './src/lint/index.js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';

export default ts.config(
	{
		ignores: [
			'.svelte-kit/',
			'build/',
			'node_modules/',
			'test-results/',
			'playwright-report/',
			'blob-report/'
		]
	},
	js.configs.recommended,
	...ts.configs.recommended,
	...svelte.configs['flat/recommended'],
	prettier,
	...svelte.configs['flat/prettier'],
	{
		languageOptions: {
			globals: { ...globals.browser, ...globals.node }
		}
	},
	{
		// eslint-plugin-svelte sets svelte-eslint-parser for these files; hand it the TS parser.
		files: ['**/*.svelte', '**/*.svelte.ts'],
		languageOptions: {
			parserOptions: { parser: ts.parser }
		}
	},
	{
		// No arbitrary Tailwind values (app/AGENTS.md, "Reuse before you build"). Class strings
		// live in components and in the ui helpers. Tests and mocks are out of scope.
		files: ['src/**/*.svelte', 'src/lib/ui/**/*.ts'],
		ignores: ['src/**/*.test.ts', 'src/lib/mocks/**'],
		plugins: { local },
		rules: { 'local/no-arbitrary-tailwind-values': 'error' }
	},
	{
		// Zod must run jitless, or its eval probe breaks the content security policy (src/csp.ts).
		// src/lib/domain/zod.ts sets that, so it is the only module that may import 'zod' for values.
		files: ['**/*.{js,ts,svelte}'],
		ignores: ['src/lib/domain/zod.ts'],
		rules: {
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'zod',
							allowTypeImports: true,
							message:
								"Import z from src/lib/domain/zod.ts, which turns off Zod's eval probe that the CSP blocks."
						}
					],
					patterns: [
						{
							group: ['zod/*'],
							allowTypeImports: true,
							message:
								"Import z from src/lib/domain/zod.ts, which turns off Zod's eval probe that the CSP blocks."
						}
					]
				}
			]
		}
	},
	{
		// Layering from plans/frontend-v1/proposal.md section 3. Empty folders are fine.
		files: ['src/**/*.{js,ts,svelte}'],
		plugins: { boundaries },
		settings: {
			// Resolves the #lib/* alias from package.json "imports", and .js imports of .ts files.
			'import/resolver': { typescript: { alwaysTryTypes: true, project: './tsconfig.json' } },
			// Test files may use the mocks (proposal.md section 7). Source files may not.
			'boundaries/files': [{ pattern: '**/*.test.ts', category: 'test' }],
			'boundaries/elements': [
				{ type: 'domain', pattern: 'src/lib/domain', partialMatch: false },
				{ type: 'api', pattern: 'src/lib/api', partialMatch: false },
				{
					type: 'feature',
					pattern: 'src/lib/features/*',
					partialMatch: false,
					capture: ['name']
				},
				{ type: 'ui', pattern: 'src/lib/ui', partialMatch: false },
				{ type: 'mocks', pattern: 'src/lib/mocks', partialMatch: false },
				{ type: 'routes', pattern: 'src/routes', partialMatch: false }
			]
		},
		rules: {
			'boundaries/dependencies': [
				'error',
				{
					default: 'disallow',
					policies: [
						{
							from: { file: { categories: 'test' } },
							allow: { to: { element: { type: 'mocks' } } }
						},
						// domain imports nothing in lib, except types from api/generated (for the mappers).
						{
							from: { element: { type: 'domain' } },
							allow: { to: { element: { type: 'domain' } } }
						},
						{
							from: { element: { type: 'domain' } },
							allow: {
								to: { element: { type: 'api', fileInternalPath: 'generated/**' } },
								dependency: { kind: 'type' }
							}
						},
						{ from: { element: { type: 'api' } }, allow: { to: { element: { type: 'api' } } } },
						{ from: { element: { type: 'ui' } }, allow: { to: { element: { type: 'ui' } } } },
						{
							from: { element: { type: 'mocks' } },
							allow: { to: { element: { types: ['api', 'domain', 'mocks'] } } }
						},
						// A feature uses api, domain and ui, its own files, and other features only through
						// their index.ts.
						{
							from: { element: { type: 'feature' } },
							allow: { to: { element: { types: ['api', 'domain', 'ui'] } } }
						},
						{
							from: { element: { type: 'feature' } },
							allow: {
								to: {
									element: {
										type: 'feature',
										captured: { name: '{{ from.element.captured.name }}' }
									}
								}
							}
						},
						{
							from: { element: { type: 'feature' } },
							allow: { to: { element: { type: 'feature', fileInternalPath: 'index.{js,ts}' } } }
						},
						// Routes use features through index.ts, plus domain and ui. Never api directly.
						{
							from: { element: { type: 'routes' } },
							allow: { to: { element: { types: ['domain', 'ui', 'routes'] } } }
						},
						{
							from: { element: { type: 'routes' } },
							allow: { to: { element: { type: 'feature', fileInternalPath: 'index.{js,ts}' } } }
						}
					]
				}
			]
		}
	}
);
