;; traditional for loop
;; for ([@initializer]; [@condition]; [increment]) @body
(for_statement
  initializer: (_)? @initializer
  condition: (_)? @condition
  increment: (_)? @increment
  body: (statement) @body
) @node

(for_in_statement
  kind: (_) @kind
  left: (_) @pattern
  ;; value: (_) @has_default
  operator: (_) @type ;; in / of
  right: (_) @expression
  body: (statement) @body
) @node