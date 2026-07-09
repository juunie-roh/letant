/**
 * Converts a Python module reference into a path-shaped specifier the core
 * resolver understands: `.mod` → `./mod`, `..pkg.mod` → `../pkg/mod`.
 *
 * Absolute references (`os`, `numpy.linalg`) are left as written — they
 * read as bare specifiers (external), exactly as they appear in source.
 * Workspace-internal absolute imports would require source-root
 * configuration and are left unresolved for now.
 */
function toModulePath(source: string): string {
  if (!source.startsWith(".")) return source;

  const dots = /^\.+/.exec(source)![0].length;
  const rest = source.slice(dots).replace(/\./g, "/");
  const prefix = dots === 1 ? "./" : "../".repeat(dots - 1);

  return rest ? prefix + rest : prefix;
}

export default toModulePath;
