import { language, query } from "./query";
import programHandler from "./scoping/extract";
import { spacesOf, unsupported } from "./scoping/rules";
import referenceHandler from "./scoping/utility/reference";
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
  query,
  captureConfig: {},
  convertConfig: { program: programHandler },
  references: referenceHandler,
  spacesOf,
  unsupported,
};

export default descriptor;
