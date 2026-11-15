import { createReferences } from "letant/utils";

import { language, utility } from "./query";
import extract from "./scoping/extract";
import { isReference, nameOf, unsupported } from "./scoping/rules";
import type { Descriptor } from "./types";

export const descriptor: Descriptor = {
  language,
  extensions: [".py", "/__init__.py"],
  extract,
  references: createReferences(utility.get("reference"), isReference),
  nameOf,
  unsupported,
};

export default descriptor;
