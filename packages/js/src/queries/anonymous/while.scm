;; while blocks
(while_statement
  condition: (parenthesized_expression (_) @condition)
  body: (statement) @body
) @node
