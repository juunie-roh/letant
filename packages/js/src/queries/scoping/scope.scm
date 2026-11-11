;; boundaries: syntax that opens a scope
;; see SCOPING.md §1 and §5; which `statement_block`s do not count is in scoping/rules.ts
[
  (program)
  (function_declaration)
  (generator_function_declaration)
  (function_expression)
  (generator_function)
  (arrow_function)
  (method_definition)
  (class_declaration)
  (class)
  (class_static_block)
  (catch_clause)
  (for_statement)
  (for_in_statement)
  (switch_body)
  (statement_block)
] @scope
