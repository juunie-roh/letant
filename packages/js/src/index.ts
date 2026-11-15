import { createReferences } from "letant/utils";

import { language, utility } from "./query";
import extract from "./scoping/extract";
import { isReference } from "./scoping/rules";
import type { Descriptor } from "./types";

export const descriptor: Descriptor = {
  language,
  extensions: [
    ".mjs",
    ".js",
    ".jsx",
    ".json",
    "/index.mjs",
    "/index.js",
    "/index.jsx",
  ],
  extract,
  references: createReferences(utility.get("reference"), isReference),
};

export default descriptor;
