;; function declaration
[
  ;; declarations
  (function_expression name: (identifier) @name) @definition.function
  (function_declaration name: (identifier) @name) @definition.function
  (generator_function name: (identifier) @name) @definition.function
  (generator_function_declaration name: (identifier) @name) @definition.function
  ;; assigned declarations
  (lexical_declaration
    (variable_declarator
      name: (identifier) @name
      value: [
        (arrow_function)
        (function_expression)
        (generator_function)
        (parenthesized_expression
          [(arrow_function) (function_expression) (generator_function)])
      ] @definition.function))
  (variable_declaration
    (variable_declarator
      name: (identifier) @name
      value: [
        (arrow_function)
        (function_expression)
        (generator_function)
        (parenthesized_expression
          [(arrow_function) (function_expression) (generator_function)])
      ] @definition.function))
] @node
