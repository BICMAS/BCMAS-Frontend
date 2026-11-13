import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind classes with conditional support.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * No-op async delay helper for mocked UX flows during migration.
 */
export function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Format a value for display; returns an em dash when empty.
 */
export function emptyFallback(
  value: string | number | null | undefined,
  fallback = "—",
) {
  if (value === null || value === undefined || value === "") {
    return fallback;
  }

  return String(value);
}
