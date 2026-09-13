import blockHandler from "./handlers/anonymous/block";
import doHandler from "./handlers/anonymous/do";
import forHandler from "./handlers/anonymous/for";
import ifHandler from "./handlers/anonymous/if";
import iifeHandler from "./handlers/anonymous/iife";
import moduleAnonymousHandler from "./handlers/anonymous/module";
import staticHandler from "./handlers/anonymous/static";
import switchHandler from "./handlers/anonymous/switch";
import whileHandler from "./handlers/anonymous/while";
import memberHandler from "./handlers/binding/member";
import moduleBindingHandler from "./handlers/binding/module";
import variableHandler from "./handlers/binding/variable";
import classHandler from "./handlers/scope/class";
import functionHandler from "./handlers/scope/function";
import iifeScopeHandler from "./handlers/scope/iife";
import methodHandler from "./handlers/scope/method";
import type { ConvertConfig } from "./types";

export const convertConfig: ConvertConfig = {
  // anonymous
  block: blockHandler,
  do: doHandler,
  for: forHandler,
  if: ifHandler,
  "iife.anonymous": iifeHandler,
  "module.anonymous": moduleAnonymousHandler,
  static: staticHandler,
  switch: switchHandler,
  while: whileHandler,
  // binding
  "module.binding": moduleBindingHandler,
  member: memberHandler,
  variable: variableHandler,
  // scope
  class: classHandler,
  function: functionHandler,
  "iife.scope": iifeScopeHandler,
  method: methodHandler,
} as const;
