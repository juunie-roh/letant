;; binding forms: syntax that introduces a name, at any depth
;; see SCOPING.md §2; the scope each name attaches to is decided in scoping/extract.ts

;; var / let / const / using
(variable_declarator name: (_) @binding.variable)

;; parameters
(formal_parameters (_) @binding.parameter)
(arrow_function parameter: (identifier) @binding.parameter)

;; names bound outside the construct they declare
(function_declaration name: (identifier) @binding.declaration)
(generator_function_declaration name: (identifier) @binding.declaration)
(class_declaration name: (identifier) @binding.declaration)

;; class elements
(field_definition property: (_) @binding.declaration)
(method_definition name: (private_property_identifier) @binding.declaration)

;; a function or class expression's own name, bound inside it
(function_expression name: (identifier) @binding.self)
(generator_function name: (identifier) @binding.self)
(class name: (identifier) @binding.self)

;; catch parameter
(catch_clause parameter: (_) @binding.catch)

;; for-in / for-of head; without a kind the head assigns to an existing binding
(for_in_statement kind: _ left: (_) @binding.loop)

;; imports
(import_statement) @binding.import
