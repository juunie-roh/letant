import { language, query } from "./query";
import programHandler from "./scoping/extract";
import referenceHandler from "./scoping/utility/reference";
import type { Descriptor } from "./types";

export const descriptor: Descriptor = {
  language,
  extensions: [".py", "/__init__.py"],
  query,
  captureConfig: {},
  convertConfig: { program: programHandler },
  references: referenceHandler,
};

export default descriptor;
