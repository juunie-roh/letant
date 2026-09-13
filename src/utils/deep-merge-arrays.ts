/**
 * Check if the variable contains an object strictly rejecting arrays.
 * @param value An object.
 * @returns Whether value is an object.
 */
function isObjectNotArray(value: unknown): boolean {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Deeply merges second on top of first, creating a new {} object if needed.
 * @param first Base, default value.
 * @param second User-specified value.
 * @returns Merged equivalent of second on top of first.
 */
function deepMergeObjects<T, U>(first: T, second: U): T | U | (T & U) {
  if (second === void 0) {
    return first;
  }

  if (!isObjectNotArray(first) || !isObjectNotArray(second)) {
    return second;
  }

  const f = first as Record<string, unknown>;
  const s = second as Record<string, unknown>;
  const result: Record<string, unknown> = { ...f, ...s };

  for (const key of Object.keys(s)) {
    if (Object.prototype.propertyIsEnumerable.call(f, key)) {
      result[key] = deepMergeObjects(f[key], s[key]);
    }
  }

  return result as T & U;
}

/**
 * Deeply merges second on top of first, creating a new [] array if needed.
 * @param first Base, default values.
 * @param second User-specified values.
 * @returns Merged equivalent of second on top of first.
 */
function deepMergeArrays<T, U>(first: T[], second: U[]): (T | U | (T & U))[] {
  if (!first || !second) {
    return (second || first || []) as (T | U | (T & U))[];
  }

  return [
    ...first.map(
      (value, i) =>
        deepMergeObjects(value, i < second.length ? second[i] : void 0) as
          T | U | (T & U),
    ),
    ...second.slice(first.length),
  ];
}

export default deepMergeArrays;
