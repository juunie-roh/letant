import { createReferences } from "letant/utils";

import { language, utility } from "./query";
import extract from "./scoping/extract";
import { isReference } from "./scoping/rules";
import unsupported from "./scoping/unsupported";
import type { Descriptor } from "./types";

export const descriptor: Descriptor = {
  language,
  extensions: [".go"],
  extract,
  references: createReferences(utility.get("reference"), isReference),
  unsupported,
};

export default descriptor;
