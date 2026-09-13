;; standalone blocks
;; anchored on the enclosing statement list so a block that is some other
;; construct's body is not matched twice
[
  (program (statement_block) @node)
  (statement_block (statement_block) @node)
  (switch_case (statement_block) @node)
  (switch_default (statement_block) @node)
]
