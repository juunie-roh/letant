;; export aliases
(export_statement
  !declaration
  (export_clause
    (export_specifier
      name: (identifier)
      alias: (identifier))) @body
  !source
) @node

;; re-exports
(export_statement
  !declaration
  (_) @body
  source: (string (string_fragment) @source)
) @node