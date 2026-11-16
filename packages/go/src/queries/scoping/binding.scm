;; binding forms: syntax that introduces a name, at any depth
;; see SCOPING.md §2; the scope each name attaches to, and the position it is
;; visible from, are decided in scoping/analyze.ts

;; var and const
;; a `const_spec` puts one `name` field over its whole list of names, and a
;; pattern with the field matches the first name only; its type and its
;; values are never an `identifier` child
(var_spec name: (identifier) @binding.variable)
(const_spec (identifier) @binding.variable)

;; in a list of expressions the grammar gives `true`, `false`, `nil` and
;; `iota` node types of their own; they are predeclared names like any other,
;; and a declaration may use them

;; short variable declaration
(short_var_declaration
  left: (expression_list [(identifier) (true) (false) (nil) (iota)] @binding.variable))

;; range and receive: with `=` they assign to existing variables
(range_clause
  left: (expression_list [(identifier) (true) (false) (nil) (iota)] @binding.variable)
  ":=")
(receive_statement
  left: (expression_list [(identifier) (true) (false) (nil) (iota)] @binding.variable)
  ":=")

;; type switch guard: one variable in each clause
(type_switch_statement
  alias: (expression_list [(identifier) (true) (false) (nil) (iota)] @binding.variable))

;; parameters, results and the receiver
(parameter_declaration name: (identifier) @binding.parameter)
(variadic_parameter_declaration name: (identifier) @binding.parameter)

;; a list of ten names or more: the grammar reads all but the last nine as
;; types. Names are all present or all absent in a list, so a declaration
;; without a name before one with a name is a name
(parameter_list
  (parameter_declaration !name type: (type_identifier) @binding.parameter)
  (parameter_declaration name: (identifier)))

;; type parameters
(type_parameter_declaration name: (identifier) @binding.parameter)

;; a receiver's type: its type arguments declare the method's type parameters
(method_declaration
  receiver: (parameter_list (parameter_declaration type: (_) @binding.parameter)))

;; names bound outside the construct they declare
(function_declaration name: (identifier) @binding.declaration)
(type_spec name: (type_identifier) @binding.declaration)
(type_alias name: (type_identifier) @binding.declaration)

;; imports
(import_spec) @binding.import
