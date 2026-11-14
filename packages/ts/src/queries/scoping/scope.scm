;; boundaries: syntax that opens a scope
;; see SCOPING.md §1 and §5; which of these do not count is in scoping/rules.ts
[
  (program)
  ;; functions, and the signatures that have parameters but no body
  (function_declaration)
  (generator_function_declaration)
  (function_expression)
  (generator_function)
  (arrow_function)
  (method_definition)
  (function_signature)
  (method_signature)
  (abstract_method_signature)
  (call_signature)
  (construct_signature)
  (function_type)
  (constructor_type)
  ;; classes
  (class_declaration)
  (abstract_class_declaration)
  (class)
  (class_static_block)
  ;; scopes that hold type parameters only
  (interface_declaration)
  (type_alias_declaration)
  (conditional_type)
  (index_signature)
  ;; namespaces and enums
  (internal_module)
  (module)
  (enum_body)
  ;; statements
  (catch_clause)
  (for_statement)
  (for_in_statement)
  (switch_body)
  (statement_block)
] @scope
