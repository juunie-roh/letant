import { captureConfig } from "./capture";
import { convertConfig } from "./convert";
import referenceHandler from "./handlers/utility/reference";
import { language, query } from "./query";
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
  captureConfig,
  convertConfig,
  references: referenceHandler,
};

export default descriptor;
