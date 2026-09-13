;; variable declarations

;; @kind = "const" | "let"
(lexical_declaration
  [("const") ("let")] @kind
  (variable_declarator
    name: (_) @name)
) @node

;; @kind = "var"
(variable_declaration
  ("var") @kind
  (variable_declarator
    name: (_) @name)
) @node

;; @kind = "using"
(using_declaration
  ("using") @kind
  (variable_declarator
    name: (_) @name)
) @node
