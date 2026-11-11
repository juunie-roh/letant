;; boundaries: syntax that opens a scope
;; see SCOPING.md §1 and §5; which parts of each node lie outside its scope is in scoping/rules.ts
[
  (module)
  (function_definition)
  (lambda)
  (class_definition)
  (list_comprehension)
  (dictionary_comprehension)
  (set_comprehension)
  (generator_expression)
] @scope

;; a type parameter list opens the annotation scope that wraps its definition;
;; the same node type is a plain subscript inside an annotation (`list[int]`)
(function_definition type_parameters: (type_parameter) @scope)
(class_definition type_parameters: (type_parameter) @scope)
(type_alias_statement left: (type (generic_type (type_parameter) @scope)))
