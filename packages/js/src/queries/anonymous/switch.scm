;; switch blocks
;; the switch body is one block scope shared by every case
(switch_statement
  value: (parenthesized_expression (_) @condition)
  body: (switch_body) @body
) @node
