;; assignment statements — Python has no declaration keyword; any
;; assignment binds in the enclosing scope
(expression_statement
  (assignment
    left: [
      (identifier)
      (pattern_list)
      (tuple_pattern)
    ] @name)
) @node

;; for-loop targets bind in the enclosing scope (no block scope)
(for_statement
  left: [
    (identifier)
    (pattern_list)
    (tuple_pattern)
  ] @name
) @node
