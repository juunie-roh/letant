;; export aliases
(export_statement
  !declaration

)

;; re-exports
(export_statement
  !declaration
  source: (string (string_fragment) @source)
)