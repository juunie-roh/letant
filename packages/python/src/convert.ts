import moduleBindingHandler from "./handlers/binding/module";
import variableHandler from "./handlers/binding/variable";
import classHandler from "./handlers/scope/class";
import functionHandler from "./handlers/scope/function";
import type { ConvertConfig } from "./types";

export const convertConfig: ConvertConfig = {
  // binding
  "module.binding": moduleBindingHandler,
  variable: variableHandler,
  // scope
  class: classHandler,
  function: functionHandler,
} as const;
