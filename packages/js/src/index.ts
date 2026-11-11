import { language, query } from "./query";
import programHandler from "./scoping/extract";
import referenceHandler from "./scoping/utility/reference";
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
  query,
  captureConfig: {},
  convertConfig: { program: programHandler },
  references: referenceHandler,
};

export default descriptor;
