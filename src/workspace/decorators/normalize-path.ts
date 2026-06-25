import { normalizePath } from "@/common/path";

/**
 * Normalizes the **first** argument of the decorated method.
 *
 * **NOTE**: The decorated class must expose a `rootDir` property.
 *
 * @see {@link normalizePath}
 */
function NormalizePath<
  This extends { rootDir: string },
  Args extends [string, ...unknown[]],
  Return,
>(
  target: (this: This, ...args: Args) => Return,
): (this: This, ...args: Args) => Return {
  return function (this: This, ...args: Args): Return {
    const [first, ...rest] = args;
    const relative = normalizePath(this.rootDir, first);

    const normalized: Args = [relative, ...rest] as Args;
    return target.apply(this, normalized);
  };
}

export default NormalizePath;
