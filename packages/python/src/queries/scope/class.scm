;; class definition
;; class @name(@extends): @body
(class_definition
  name: (identifier) @name
  superclasses: (argument_list)? @extends
  body: (block) @body
) @node
