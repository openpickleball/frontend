import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// tailwind-merge only knows Tailwind's default scales. Tell it about our spacing token, so a
// later `p-0` replaces `px-gutter` instead of keeping both.
const twMerge = extendTailwindMerge({ extend: { theme: { spacing: ['gutter'] } } });

/** Joins class names and resolves conflicting Tailwind utilities (the last one wins). */
export function cn(...inputs: ClassValue[]): string {
	return twMerge(clsx(inputs));
}

// Helper types the shadcn-svelte components rely on.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChild<T> = T extends { child?: any } ? Omit<T, 'child'> : T;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type WithoutChildren<T> = T extends { children?: any } ? Omit<T, 'children'> : T;
export type WithoutChildrenOrChild<T> = WithoutChildren<WithoutChild<T>>;
export type WithElementRef<T, U extends HTMLElement = HTMLElement> = T & { ref?: U | null };
