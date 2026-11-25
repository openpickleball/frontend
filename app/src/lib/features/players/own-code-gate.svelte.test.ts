import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRawSnippet } from 'svelte';
import { render } from 'vitest-browser-svelte';
import { page } from 'vitest/browser';
import { buildCode, type PlayerCode } from '#lib/domain/index.js';
import { myCode } from './my-code.svelte.js';
import OwnCodeGate from './own-code-gate.svelte';

const CODE = buildCode('player', '4RWN8TQ') as PlayerCode;

const children = createRawSnippet((code: () => PlayerCode) => ({
	render: () => `<p data-testid="own">${code()}</p>`
}));

let load: ReturnType<typeof vi.spyOn>;

// The store is reset before each test, not after: the gate is still mounted when afterEach runs.
beforeEach(() => {
	myCode.reset();
	load = vi.spyOn(myCode, 'load').mockResolvedValue();
});

afterEach(() => {
	load.mockRestore();
});

describe('OwnCodeGate', () => {
	it('loads the code when nothing has, and shows the loading copy', async () => {
		await render(OwnCodeGate, { children, signedOut: 'x', loading: 'Loading your profile…' });
		await expect.element(page.getByRole('status')).toHaveTextContent('Loading your profile…');
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('shows the code to its children, without asking again', async () => {
		myCode.save(CODE);
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect.element(page.getByTestId('own')).toHaveTextContent(CODE);
		expect(load).not.toHaveBeenCalled();
	});

	it('asks again on open with reloadOnOpen, even when the code is known', async () => {
		myCode.save(CODE);
		await render(OwnCodeGate, { children, signedOut: 'x', reloadOnOpen: true });
		await expect.element(page.getByTestId('own')).toBeVisible();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('loads again after the store is reset, unless reloadOnOpen', async () => {
		myCode.save(CODE);
		await render(OwnCodeGate, { children, signedOut: 'x' });
		myCode.reset();
		await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
	});

	it('asks a signed-out visitor to sign in, with the page copy', async () => {
		myCode.status = 'signed-out';
		await render(OwnCodeGate, { children, signedOut: 'Sign in to record a match.' });
		await expect.element(page.getByText('Sign in to record a match.')).toBeVisible();
		await expect
			.element(page.getByRole('link', { name: 'Sign in' }))
			.toHaveAttribute('href', '/account/login');
	});

	it('shows the default error with Try again, which loads again', async () => {
		myCode.status = 'error';
		await render(OwnCodeGate, { children, signedOut: 'x', errorText: 'No server.' });
		await expect.element(page.getByRole('alert').getByText('No server.')).toBeVisible();
		await page.getByRole('button', { name: 'Try again' }).click();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('uses an error snippet in place of the default one', async () => {
		myCode.status = 'error';
		const error = createRawSnippet(() => ({ render: () => `<p>Custom error</p>` }));
		await render(OwnCodeGate, { children, signedOut: 'x', error });
		await expect.element(page.getByText('Custom error')).toBeVisible();
		await expect.element(page.getByRole('alert')).not.toBeInTheDocument();
	});

	it('prompts for a first code with the given heading', async () => {
		myCode.status = 'needs-entry';
		await render(OwnCodeGate, { children, signedOut: 'x', entryHeading: 'Enter it here' });
		await expect.element(page.getByRole('heading', { name: 'Enter it here' })).toBeVisible();
	});

	describe('while the player changes a code from this device', () => {
		beforeEach(() => {
			myCode.save(CODE);
			myCode.change();
		});

		it('keeps showing the children by default', async () => {
			await render(OwnCodeGate, { children, signedOut: 'x' });
			await expect.element(page.getByTestId('own')).toBeVisible();
		});

		it('shows the plain prompt, with no Cancel, with showChange', async () => {
			await render(OwnCodeGate, { children, signedOut: 'x', showChange: true });
			await expect
				.element(page.getByRole('heading', { name: 'Enter your OPEN code' }))
				.toBeVisible();
			await expect.element(page.getByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
		});

		it('shows the change heading and a Cancel that goes back, with changeHeading', async () => {
			await render(OwnCodeGate, {
				children,
				signedOut: 'x',
				showChange: true,
				changeHeading: 'Change your OPEN code'
			});
			await expect
				.element(page.getByRole('heading', { name: 'Change your OPEN code' }))
				.toBeVisible();
			await page.getByRole('button', { name: 'Cancel' }).click();
			await expect.element(page.getByTestId('own')).toHaveTextContent(CODE);
		});
	});

	describe('when the backend needs the details', () => {
		beforeEach(() => {
			myCode.status = 'needs-details';
		});

		it('shows the details form, with no code prompt', async () => {
			await render(OwnCodeGate, { children, signedOut: 'x' });
			await expect
				.element(page.getByRole('heading', { name: 'Finish your player profile' }))
				.toBeVisible();
			await expect
				.element(
					page.getByText(
						'We need your birth month and year, gender and a display name again. This can happen if you confirmed your email on another device.'
					)
				)
				.toBeVisible();
			await expect.element(page.getByLabelText('Display name')).toBeVisible();
			await expect.element(page.getByLabelText('Your OPEN code')).not.toBeInTheDocument();
		});

		it('sends the details through myCode', async () => {
			const submit = vi.spyOn(myCode, 'submitDetails').mockResolvedValue();
			await render(OwnCodeGate, { children, signedOut: 'x' });
			await page.getByLabelText('Month').selectOptions('June');
			await page.getByLabelText('Year').fill('1990');
			await page.getByRole('radio', { name: 'Man' }).click();
			await page.getByLabelText('Display name').fill('Sam Rivera');
			await page.getByRole('button', { name: 'Save and show my code' }).click();
			expect(submit).toHaveBeenCalledWith({
				birth_month: 6,
				birth_year: 1990,
				gender_division: 'mens',
				display_name: 'Sam Rivera'
			});
			submit.mockRestore();
		});

		it("shows the backend's field errors", async () => {
			myCode.detailErrors = { birth_year: 'Ensure this value is greater than or equal to 1900.' };
			await render(OwnCodeGate, { children, signedOut: 'x' });
			await expect
				.element(page.getByLabelText('Year'))
				.toHaveAccessibleDescription('Ensure this value is greater than or equal to 1900.');
		});
	});

	it('says the profile cannot be created after an age refusal, with no form or prompt', async () => {
		myCode.status = 'refused';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect
			.element(page.getByText("We can't create a player profile with these details."))
			.toBeVisible();
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
		await expect.element(page.getByRole('button')).not.toBeInTheDocument();
	});

	it('says the email is not verified yet, with Try again', async () => {
		myCode.status = 'unverified';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect.element(page.getByText(/email address is not verified yet/)).toBeVisible();
		await page.getByRole('button', { name: 'Try again' }).click();
		expect(load).toHaveBeenCalledTimes(1);
	});

	it('says the player profile could not be created, with no form or prompt', async () => {
		myCode.status = 'not-created';
		await render(OwnCodeGate, { children, signedOut: 'x' });
		await expect
			.element(page.getByText("We can't create your player profile from your signup details."))
			.toBeVisible();
		await expect.element(page.getByRole('textbox')).not.toBeInTheDocument();
	});
});
