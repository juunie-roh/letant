import { QueryMap } from "letant/query";
import type Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

// scoping
import bindingQueryString from "@/queries/scoping/binding.scm";
import scopeQueryString from "@/queries/scoping/scope.scm";
// utility
import referenceQueryString from "@/queries/utility/reference.scm";

import { ScopingQueryKey, UtilityQueryKey } from "./types";

export const language = TypeScript.tsx as Parser.Language;

export const scoping = new QueryMap<ScopingQueryKey>(language)
  .set("scope", scopeQueryString)
  .set("binding", bindingQueryString);

export const utility = new QueryMap<UtilityQueryKey>(language).set(
  "reference",
  referenceQueryString,
);
