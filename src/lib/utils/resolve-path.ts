/**
 * Narrows `unknown` to a plain object record, or returns `null`.
 */
export function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/**
 * Resolve a (possibly nested) value from a plain object tree using a
 * dot-separated path.
 *
 * Supports:
 * - Dot notation: `"foo.bar.baz"`
 * - Bracket notation: `"items[0].name"`
 * - JSONPath `$` prefix: `"$.foo.bar"` (the `$` is stripped)
 */
export function resolvePathValue(
  root: unknown,
  path: string,
): unknown {
  const segments =
    path
      .replace(/^\$\.?/, "")
      .replace(/\[(\d+)\]/g, ".$1")
      .split(".")
      .map((segment) => segment.trim())
      .filter(Boolean) ?? [];

  if (segments.length === 0) {
    return root;
  }

  let cursor: unknown = root;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) {
      return null;
    }

    if (Array.isArray(cursor)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= cursor.length) {
        return null;
      }
      cursor = cursor[index];
      continue;
    }

    if (typeof cursor === "object") {
      cursor = (cursor as Record<string, unknown>)[segment];
      continue;
    }

    return null;
  }

  return cursor;
}
