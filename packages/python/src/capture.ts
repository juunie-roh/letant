import bypassCompound from "./handlers/bypass/compound";
import type { CaptureConfig } from "./types";

// every query bypasses compound statements: Python `if`/`for`/`while`/
// `try`/`with` blocks do not create scopes, so declarations inside them
// bind to the enclosing scope
export const captureConfig: CaptureConfig = {
  "module.binding": {
    bypass: bypassCompound("module.binding"),
  },
  variable: {
    bypass: bypassCompound("variable"),
  },
  class: {
    bypass: bypassCompound("class"),
  },
  function: {
    bypass: bypassCompound("function"),
  },
} as const;
