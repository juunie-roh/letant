;; IIFE Immediately Invoked Function Expression
;; unassigned iife
;; standard iife, (function (){})()
(expression_statement
  (call_expression
    function: (parenthesized_expression 
                [
                  ;; (function () @body)()
                  (function_expression body: (statement_block) @body)
                  ;; (() => @body)()
                  (arrow_function body: (statement_block) @body)
                ]))
) @node
;; crockford style, (function (){}())
(expression_statement
  (parenthesized_expression
    (call_expression
      function: [
        ;; (function () {}())
        (function_expression body: (statement_block) @body)
        ;; (() => {}())
        (arrow_function body: (statement_block) @body)
      ]))
) @node
;; method-style, (function () {}).call/apply(this)
(expression_statement
  (parenthesized_expression
    (call_expression
      function: (member_expression
                  object: [
                    ;; (function () @body).call/apply(this)
                    (function_expression body: (statement_block) @body)
                    ;; (() => @body).call/apply(this)
                    (arrow_function body: (statement_block) @body)
                  ]
                  property: (property_identifier) @c (#any-of? @c "call" "apply"))))
) @node