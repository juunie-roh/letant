import { createReferences } from "letant/utils";

import { language, utility } from "./query";
import extract from "./scoping/extract";
import { isReference, spacesOf, unsupported } from "./scoping/rules";
import type { Descriptor } from "./types";

export const descriptor: Descriptor = {
  language,
  extensions: [
    ".mts",
    ".ts",
    ".tsx",
    ".mjs",
    ".js",
    ".jsx",
    ".json",
    "/index.mts",
    "/index.ts",
    "/index.tsx",
    "/index.mjs",
    "/index.js",
    "/index.jsx",
  ],
  extract,
  references: createReferences(utility.get("reference"), isReference),
  spacesOf,
  unsupported,
};

export default descriptor;
