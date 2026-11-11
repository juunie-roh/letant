;; binding forms: syntax that introduces a name, at any depth
;; see SCOPING.md §2; the scope each name attaches to is decided in scoping/extract.ts

;; assignment, with or without an annotation, and augmented assignment
(assignment left: (_) @binding.variable right: (_))
(augmented_assignment left: (_) @binding.variable)

;; an annotation without a value binds only a bare name
(assignment left: (identifier) @binding.variable !right)

;; assignment expression
(named_expression name: (identifier) @binding.variable)

;; for targets: the statement and the comprehension clause
(for_statement left: (_) @binding.variable)
(for_in_clause left: (_) @binding.variable)

;; with ... as target; a single parenthesized item parses as an expression
(with_item value: (as_pattern alias: (as_pattern_target (_) @binding.variable)))
(with_item value: (parenthesized_expression (as_pattern alias: (as_pattern_target (_) @binding.variable))))

;; except ... as target
(except_clause (as_pattern alias: (as_pattern_target (_) @binding.variable)))

;; match: capture, `as` and star patterns; a dotted name with one segment is a capture
(case_pattern (dotted_name . (identifier) @binding.variable .))
(keyword_pattern (dotted_name . (identifier) @binding.variable .))
(as_pattern (case_pattern) (identifier) @binding.variable)
(splat_pattern (identifier) @binding.variable)

;; del targets count as bound
(delete_statement (_) @binding.variable)

;; parameters
(parameters (_) @binding.parameter)
(lambda_parameters (_) @binding.parameter)

;; type parameters
(function_definition type_parameters: (type_parameter (type) @binding.parameter))
(class_definition type_parameters: (type_parameter (type) @binding.parameter))
(type_alias_statement left: (type (generic_type (type_parameter (type) @binding.parameter))))

;; names bound outside the construct they declare
(function_definition name: (identifier) @binding.declaration)
(class_definition name: (identifier) @binding.declaration)
(type_alias_statement left: (type [
  (identifier) @binding.declaration
  (generic_type . (identifier) @binding.declaration)
]))

;; imports
[
  (import_statement)
  (import_from_statement)
  (future_import_statement)
] @binding.import

;; not binding forms: they move the listed names to another scope
(global_statement (identifier) @binding.global)
(nonlocal_statement (identifier) @binding.nonlocal)
