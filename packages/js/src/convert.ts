import ifHandler from "./handlers/anonymous/if";
import iifeHandler from "./handlers/anonymous/iife";
import whileHandler from "./handlers/anonymous/while";
import esmBindingHandler from "./handlers/binding/esm";
import memberHandler from "./handlers/binding/member";
import variableHandler from "./handlers/binding/variable";
import classHandler from "./handlers/scope/class";
import functionHandler from "./handlers/scope/function";
import iifeScopeHandler from "./handlers/scope/iife";
import methodHandler from "./handlers/scope/method";
import type { ConvertConfig } from "./types";

export const convertConfig: ConvertConfig = {
  // anonymous
  if: ifHandler,
  "iife.anonymous": iifeHandler,
  while: whileHandler,
  // binding
  "esm.binding": esmBindingHandler,
  member: memberHandler,
  variable: variableHandler,
  // scope
  class: classHandler,
  function: functionHandler,
  "iife.scope": iifeScopeHandler,
  method: methodHandler,
} as const;
