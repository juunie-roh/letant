;; methods
;; @decorator @is_static @is_async @name@params @body
(method_definition
  "static"? @is_static
  "async"? @is_async
  name: (_) @name
  parameters: (formal_parameters) @params
  body: (statement_block) @body
) @node

;; (method_definition
;;   "static"? @is_static
;;   name: (_) @name) @definition.method

;; arrow function / function expression methods
(public_field_definition
  "static"? @is_static
  name: (_) @name
  value: [
    ;; @decorator @is_static @name = @is_async @params => @body
    (arrow_function
      "async"? @is_async
      parameters: [(formal_parameters) (identifier)] @params
      body: (_) @body)
    ;; @decorator @is_static @name = @is_async function @params @body
    (function_expression
      "async"? @is_async
      parameters: (formal_parameters) @params
      body: (statement_block) @body)
  ]
) @node