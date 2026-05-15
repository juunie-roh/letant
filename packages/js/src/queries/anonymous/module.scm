;; ESM
;; unassigned import
;; import "@source";
(import_statement
  "from"? @f (#not-eq? @f "from")
  source: (string (string_fragment) @source)
)