import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Only allow same-site relative redirects (prevents open redirects via ?next=). */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
  if (!target || !target.startsWith('/') || target.startsWith('//') || target.startsWith('/\\')) return fallback;
  return target;
}

export const formatNumber = (n: number) => new Intl.NumberFormat().format(n);

export const titleCase = (value: string) => value.charAt(0) + value.slice(1).toLowerCase();
