;; boundaries: syntax that opens a scope
;; see SCOPING.md §1 and §5; which `block`s do not count is in scoping/rules.ts
[
  (source_file)
  (function_declaration)
  (method_declaration)
  (func_literal)
  (function_type)
  (method_elem)
  (block)
  (if_statement)
  (for_statement)
  (expression_switch_statement)
  (type_switch_statement)
  (expression_case)
  (type_case)
  (default_case)
  (communication_case)
] @scope

;; the type parameters of a type are visible up to the end of its spec
(type_spec type_parameters: (type_parameter_list)) @scope
(type_alias type_parameters: (type_parameter_list)) @scope
