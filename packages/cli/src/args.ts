import { createArgument } from "@commander-js/extra-typings";

export const fileArg = createArgument("<file>", "A file path to process");

export const othersArg = createArgument(
  "[others...]",
  "Other paths to process",
).argOptional();
