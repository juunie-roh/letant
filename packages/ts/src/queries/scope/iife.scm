;; assigned iife

;; @kind = const/let
(lexical_declaration
  ["const" "let"] @kind
  (variable_declarator
    name: (_) @name
    value: [
      ;; standard iife, (function (){})()
      (call_expression
        function: (parenthesized_expression
                    [ 
                      ;; const/let x = (function () { @body })()
                      (function_expression body: (statement_block) @body)
                      ;; const/let x = (() => { @body })()
                      (arrow_function body: (statement_block) @body)
                    ]))
      ;; crockford style, (function (){}())                    
      (parenthesized_expression
        (call_expression
          function: [
            ;; const/let x = (function () {}());
            (function_expression body: (statement_block) @body)
            ;; const/let x = (() => {}());
            (arrow_function body: (statement_block) @body)
          ]))
    ])
)

(lexical_declaration
  ["const" "let"] @kind
  (variable_declarator
    name: (_) @name
    value:
      ;; method-style, (function () {}).call/apply(this)
      (call_expression
        function: (member_expression
                    object: (parenthesized_expression
                              [ 
                                ;; const/let x = (function () { @body }).call/apply(this)
                                (function_expression body: (statement_block) @body)
                                ;; const/let x = (() => { @body }).call/apply(this)
                                (arrow_function body: (statement_block) @body)
                              ])
                    property: (property_identifier) @c)))
  (#any-of? @c "call" "apply")
)

;; @kind = var
(variable_declaration
  "var" @kind
  (variable_declarator
    name: (_) @name
    value: [
      ;; standard, (function (){})()
      ;; var x = (function () { @body })()
      ;; var x = (() => { @body })()
      (call_expression
        function:
          (parenthesized_expression
            [ 
              (function_expression body: (statement_block) @body)
              (arrow_function body: (statement_block) @body)
            ]))
      ;; crockford style, (function (){}())
      ;; var x = (function () {}());
      ;; var x = (() => {}());
      (parenthesized_expression
        (call_expression
          function: [
            (function_expression body: (statement_block) @body)
            (arrow_function body: (statement_block) @body)
          ]))
    ])
)
;; method-style, (function () {}).call/apply(this)
(variable_declaration
  "var" @kind
  (variable_declarator
    name: (_) @name
    value:
      ;; var x = (function () { @body }).call/apply(this)
      ;; var x = (() => { @body }).call/apply(this)
      (call_expression
        function: (member_expression
                    object: (parenthesized_expression
                      [ 
                        (function_expression body: (statement_block) @body)
                        (arrow_function body: (statement_block) @body)
                      ])
                    property: (property_identifier) @c)))
  (#any-of? @c "call" "apply")
)