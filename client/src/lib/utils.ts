// Shared utility helpers
// Populated as needed by feature tasks

/**
 * Formats an ISO 8601 date string into a human-readable short date.
 * Example: "2026-04-16T10:00:00Z" → "Apr 16, 2026"
 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

/**
 * Joins class names, filtering out falsy values.
 * Lightweight alternative to clsx for simple cases.
 */
export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ')
}
