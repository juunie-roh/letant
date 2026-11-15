;; binding forms: syntax that introduces a name, at any depth
;; see SCOPING.md §2; the scope and the space of each name are decided in scoping/extract.ts

;; var / let / const
(variable_declarator name: (_) @binding.variable)
;; using / await using: the grammar reads them as an assignment after a `using` token
(assignment_expression "using" left: (identifier) @binding.variable)

;; parameters
(formal_parameters (_) @binding.parameter)
(arrow_function parameter: (identifier) @binding.parameter)
(index_signature name: (identifier) @binding.parameter)

;; type parameters: of a generic, of `infer`, of a mapped type
(type_parameter name: (type_identifier) @binding.parameter)
(infer_type . (type_identifier) @binding.parameter)
(mapped_type_clause name: (type_identifier) @binding.parameter)

;; names bound outside the construct they declare
(function_declaration name: (identifier) @binding.declaration)
(generator_function_declaration name: (identifier) @binding.declaration)
(function_signature name: (identifier) @binding.declaration)
(class_declaration name: (type_identifier) @binding.declaration)
(abstract_class_declaration name: (type_identifier) @binding.declaration)
(interface_declaration name: (type_identifier) @binding.declaration)
(type_alias_declaration name: (type_identifier) @binding.declaration)
(enum_declaration name: (identifier) @binding.declaration)
(internal_module name: [(identifier) (nested_identifier)] @binding.declaration)
(module name: [(identifier) (nested_identifier)] @binding.declaration)

;; class elements
(public_field_definition name: (_) @binding.declaration)
(method_definition name: (private_property_identifier) @binding.declaration)

;; enum members
(enum_body name: (property_identifier) @binding.declaration)
(enum_assignment name: (property_identifier) @binding.declaration)

;; a function or class expression's own name, bound inside it
(function_expression name: (identifier) @binding.self)
(generator_function name: (identifier) @binding.self)
(class name: (type_identifier) @binding.self)

;; catch parameter
(catch_clause parameter: (_) @binding.catch)

;; for-in / for-of head; without a kind the head assigns to an existing binding
(for_in_statement kind: _ left: (_) @binding.loop)

;; imports, and `import a = N.b`
(import_statement) @binding.import
(import_alias) @binding.import
