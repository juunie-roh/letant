;; ESM
;; top-stated static imports
(import_statement
  (import_clause
    [
      ;; import @name from "@source";
      (identifier) @name
      ;; import * as @name from "@source";
      (namespace_import (identifier) @name)
      ;; import { @name as @alias } from "@source";
      (named_imports
        (import_specifier
          name: (identifier) @name
          alias: (identifier)? @alias))
    ])
  source: (string (string_fragment) @source)
)
