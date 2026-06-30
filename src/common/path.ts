import path from "node:path";
import { cwd } from "node:process";

import { LetantError } from "./error";

/**
 * Normalizes the file path to a path relative to `rootDir`.
 * Both absolute and relative paths are resolved against the
 * anchor before being made relative.
 *
 * @throws If the resolved path escapes the root directory.
 */
export function normalizePath(rootDir: string, filePath: string): string {
  const anchor = path.resolve(cwd(), rootDir);
  const relative = path.relative(anchor, path.resolve(anchor, filePath));

  if (relative.startsWith("..")) {
    throw new LetantError(
      "CORE_INVALID_ACCESS",
      `Access outside root is not allowed: "${relative}"`,
    );
  }

  return relative;
}
