import type Parser from "tree-sitter";

import type { Plugin } from "@/core";

/**
 *  Validates whether the target is tree-sitter language module.
 */
export function isTreeSitterLanguage(
  target: unknown,
): target is Parser.Language {
  return (
    typeof target === "object" &&
    target !== null &&
    "nodeTypeInfo" in target &&
    target.nodeTypeInfo !== null &&
    Array.isArray(target.nodeTypeInfo)
  );
}

/**
 * Validates whether the target is a record of tree-sitter language module.
 */
export function isTreeSitterLanguageRecord(
  target: unknown,
): target is Record<string, Parser.Language> {
  return (
    typeof target === "object" &&
    target !== null &&
    Object.values(target).length > 0 &&
    Object.values(target).every(isTreeSitterLanguage)
  );
}

/**
 * Coerces the target to satisfy {@link Parser.Language}.
 */
export function assertTreeSitterLanguage(
  target: unknown,
  name: string,
  error: Error,
): asserts target is Parser.Language {
  if (!isTreeSitterLanguage(target)) {
    if (isTreeSitterLanguageRecord(target)) {
      // if a module exports the record of languages, output help message
      error.message = `${name} requires a language spec: ${Object.keys(target).join(" or ")}`;
      throw error;
    }

    // throws on invalid module
    error.message = `Invalid tree-sitter language: ${name}`;
    throw error;
  }
}

/**
 * Coerces the target to satisfy {@link Plugin.Descriptor}.
 */
export function assertPluginDescriptor(
  target: unknown,
  name: string,
  error: Error,
): asserts target is Plugin.Descriptor {
  const fail = (reason: string) => {
    error.message = `Failed to load plugin "${name}", ${reason}`;
    throw error;
  };

  if (typeof target !== "object" || target === null)
    fail("target is not an object");

  const mod = target as Record<string, unknown>;

  if (!isTreeSitterLanguage(mod.language))
    fail("missing or invalid tree-sitter language");

  if (!mod.query) fail("missing or invalid 'query'");

  if (typeof mod.captureConfig !== "object" || mod.captureConfig === null)
    fail("missing or invalid 'captureConfig'");

  if (typeof mod.convertConfig !== "object" || mod.convertConfig === null)
    fail("missing or invalid 'convertConfig'");
}
