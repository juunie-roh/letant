;; if blocks
(if_statement
  condition: (parenthesized_expression (_) @condition)
  consequence: (statement) @body
  alternative: (else_clause (statement) @else_body)? @else
) @node