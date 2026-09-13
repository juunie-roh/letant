;; do-while blocks
(do_statement
  body: (statement) @body
  condition: (parenthesized_expression (_) @condition)
) @node
