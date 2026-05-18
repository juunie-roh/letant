import { QueryMap } from "letant/query";
import type Parser from "tree-sitter";
import TypeScript from "tree-sitter-typescript";

// anonymous
import ifQueryString from "@/queries/anonymous/if.scm";
import iifeAnonymousQueryString from "@/queries/anonymous/iife.scm";
import moduleAnonymousQueryString from "@/queries/anonymous/module.scm";
import whileQueryString from "@/queries/anonymous/while.scm";
// binding
import memberQueryString from "@/queries/binding/member.scm";
import moduleBindingQueryString from "@/queries/binding/module.scm";
import variableQueryString from "@/queries/binding/variable.scm";
// bypass
import exportBypassString from "@/queries/bypass/export.scm";
// scope
import classQueryString from "@/queries/scope/class.scm";
import functionQueryString from "@/queries/scope/function.scm";
import iifeScopeQueryString from "@/queries/scope/iife.scm";
import methodQueryString from "@/queries/scope/method.scm";
// utility
import referenceQueryString from "@/queries/utility/reference.scm";

// utility
import { BypassQueryKey, QueryConfig, UtilityQueryKey } from "./types";

export const language = TypeScript.tsx as Parser.Language;

export const query = new QueryMap<keyof QueryConfig>(language)
  // anonymous
  .set("if", ifQueryString)
  .set("iife.anonymous", iifeAnonymousQueryString)
  .set("module.anonymous", moduleAnonymousQueryString)
  .set("while", whileQueryString)
  // binding
  .set("module.binding", moduleBindingQueryString)
  .set("member", memberQueryString)
  .set("variable", variableQueryString)
  // scope
  .set("class", classQueryString)
  .set("function", functionQueryString)
  .set("iife.scope", iifeScopeQueryString)
  .set("method", methodQueryString);

export const bypass = new QueryMap<BypassQueryKey>(language).set(
  "export",
  exportBypassString,
);

export const utility = new QueryMap<UtilityQueryKey>(language).set(
  "reference",
  referenceQueryString,
);
