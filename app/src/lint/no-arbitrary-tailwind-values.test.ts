import { ESLint } from 'eslint';
import svelte from 'eslint-plugin-svelte';
import ts from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import local from './index.js';
import { findArbitraryValues } from './no-arbitrary-tailwind-values.js';

const RULE = 'local/no-arbitrary-tailwind-values';

describe('findArbitraryValues', () => {
	it('flags arbitrary values', () => {
		expect(findArbitraryValues('text-[15px] max-w-[420px] md:-mr-[0.1em]')).toEqual([
			'text-[15px]',
			'max-w-[420px]',
			'md:-mr-[0.1em]'
		]);
		expect(findArbitraryValues("grid-cols-[1fr_auto] before:content-['']")).toHaveLength(2);
		expect(findArbitraryValues('hover:bg-[#fff]/50 !w-[3px]')).toHaveLength(2);
		expect(findArbitraryValues('[mask-type:luminance]')).toEqual(['[mask-type:luminance]']);
		expect(findArbitraryValues('text-[clamp(26px,8vw,40px)]')).toHaveLength(1);
	});

	it('flags a value after an arbitrary variant', () => {
		expect(findArbitraryValues('data-[state=open]:w-[5px]')).toEqual(['data-[state=open]:w-[5px]']);
	});

	it('allows calc(), env() and var() values', () => {
		expect(
			findArbitraryValues(
				'pb-[calc(32px+env(safe-area-inset-bottom))] pl-[max(var(--spacing-gutter),env(safe-area-inset-left))] max-w-[calc(var(--container-2xl)+2*var(--spacing-gutter))] h-[env(safe-area-inset-top)] w-[var(--x)]'
			)
		).toEqual([]);
	});

	it('allows arbitrary variants, which are selectors', () => {
		expect(
			findArbitraryValues(
				'data-[state=open]:animate-fade-in aria-[current=page]:font-semibold group-has-[>svg]/alert:col-start-2 has-[[data-slot=x][aria-invalid=true]]:border-danger *:[svg]:size-5 [&>p]:mt-2'
			)
		).toEqual([]);
	});

	it('ignores defaults, fractions and plain text', () => {
		expect(
			findArbitraryValues('max-w-3/5 w-1/2 -outline-offset-6 h-(--header-height) a[0]')
		).toEqual([]);
		expect(findArbitraryValues('')).toEqual([]);
	});
});

function makeEslint() {
	return new ESLint({
		overrideConfigFile: true,
		overrideConfig: [
			...svelte.configs['flat/base'],
			{
				files: ['**/*.svelte'],
				languageOptions: { parserOptions: { parser: ts.parser } }
			},
			{
				files: ['**/*.ts'],
				languageOptions: { parser: ts.parser }
			},
			{
				files: ['**/*.svelte', '**/*.ts'],
				plugins: { local },
				rules: { [RULE]: 'error' }
			}
		]
	});
}

async function lint(code: string, filePath: string) {
	const [result] = await makeEslint().lintText(code, { filePath });
	return result.messages.filter((m) => m.ruleId === RULE);
}

describe('local/no-arbitrary-tailwind-values', () => {
	it('reports a class attribute in a Svelte template', async () => {
		const messages = await lint('<div class="p-4 text-[15px]"></div>', 'a.svelte');
		expect(messages).toHaveLength(1);
		expect(messages[0].message).toContain('text-[15px]');
	});

	it('reports a class in a mustache expression and in a template literal', async () => {
		expect(await lint(`<div class={['w-[10px]', 'p-4']}></div>`, 'a.svelte')).toHaveLength(1);
		expect(await lint("<div class=\"a {x ? 'h-[9px]' : ''}\"></div>", 'a.svelte')).toHaveLength(1);
		expect(await lint('export const c = `mt-[3px] ${x}`;', 'a.ts')).toHaveLength(1);
	});

	it('reports a class string in a TypeScript variants file', async () => {
		expect(await lint("export const base = 'size-[18px] p-4';", 'a.ts')).toHaveLength(1);
	});

	it('allows calc(), env() and variants', async () => {
		const code =
			'<div class="pb-[calc(32px+env(safe-area-inset-bottom))] data-[state=open]:p-4"></div>';
		expect(await lint(code, 'a.svelte')).toEqual([]);
	});

	it('does not touch strings that are not class names', async () => {
		expect(await lint("const re = /[a-z]+/; const a = ['x', 'y'][0];", 'a.ts')).toEqual([]);
	});

	it('accepts an eslint-disable-next-line comment with a reason in script', async () => {
		const code = `// eslint-disable-next-line ${RULE} -- no default for this\nexport const base = 'w-[10px]';`;
		expect(await lint(code, 'a.ts')).toEqual([]);
	});

	it('accepts a disable block around a Svelte element', async () => {
		const code = `<!-- eslint-disable ${RULE} -- reason -->\n<div\n\tclass="w-[10px]"\n></div>\n<!-- eslint-enable ${RULE} -->\n<div class="h-[10px]"></div>`;
		const messages = await lint(code, 'a.svelte');
		expect(messages).toHaveLength(1);
		expect(messages[0].message).toContain('h-[10px]');
	});
});
