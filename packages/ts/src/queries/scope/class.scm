;; class declaration
;; @decorator class @name extends @extends @body
(class_declaration
  name: (type_identifier) @name
  (class_heritage (_) @extends)?
  body: (class_body) @body
) @node

;; const/let @name = @decorator class extends @extends @body
(lexical_declaration
  (variable_declarator
    name: (identifier) @name
    value: (class 
      (class_heritage (_) @extends)?
      body: (class_body) @body
      ))
) @node

;; var @name = @decorator class extends @extends @body
(variable_declaration
  (variable_declarator
    name: (identifier) @name
    value: (class 
      (class_heritage (_) @extends)?
      body: (class_body) @body
      ))
) @node