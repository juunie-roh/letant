;; positions that name a binding (SCOPING.md §4)
;; fields, methods and labels have node types of their own; what the first
;; three types do not tell apart is decided in scoping/rules.ts. `true`,
;; `false`, `nil` and `iota` are predeclared names a program may declare again
[
  (identifier)
  (type_identifier)
  (package_identifier)
  (true)
  (false)
  (nil)
  (iota)
] @reference
