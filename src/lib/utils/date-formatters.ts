/**
 * Centralized date formatting helpers.
 *
 * Previously duplicated in stage-config-editor and admin-dashboard.
 */

/**
 * Extract `YYYY-MM-DD` from an ISO date string (for `<input type="date">`).
 * Returns empty string for null/undefined.
 */
export function toDateInputValue(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  return value.slice(0, 10);
}
