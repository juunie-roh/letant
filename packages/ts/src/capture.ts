import bypassExport from "./handlers/bypass/export";
import type { CaptureConfig } from "./types";

export const captureConfig: CaptureConfig = {
  class: {
    bypass: bypassExport("class"),
  },
  function: {
    bypass: bypassExport("function"),
  },
  variable: {
    bypass: bypassExport("variable"),
  },
} as const;
