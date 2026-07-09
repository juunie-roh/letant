import { QueryMap } from "letant/query";
import type Parser from "tree-sitter";
import Python from "tree-sitter-python";

// binding
import moduleBindingQueryString from "@/queries/binding/module.scm";
import variableQueryString from "@/queries/binding/variable.scm";
// scope
import classQueryString from "@/queries/scope/class.scm";
import functionQueryString from "@/queries/scope/function.scm";
// utility
import referenceQueryString from "@/queries/utility/reference.scm";

import { QueryConfig, UtilityQueryKey } from "./types";

export const language = Python as Parser.Language;

export const query = new QueryMap<keyof QueryConfig>(language)
  // binding
  .set("module.binding", moduleBindingQueryString)
  .set("variable", variableQueryString)
  // scope
  .set("class", classQueryString)
  .set("function", functionQueryString);

export const utility = new QueryMap<UtilityQueryKey>(language).set(
  "reference",
  referenceQueryString,
);
