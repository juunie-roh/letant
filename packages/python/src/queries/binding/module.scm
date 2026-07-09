;; import @source            — binds the first segment of @source
(import_statement
  name: (dotted_name) @source @name)

;; import @source as @alias
(import_statement
  name: (aliased_import
    name: (dotted_name) @source
    alias: (identifier) @alias))

;; from @source import @name
(import_from_statement
  module_name: [
    (dotted_name)
    (relative_import)
  ] @source
  name: (dotted_name) @name)

;; from @source import @name as @alias
(import_from_statement
  module_name: [
    (dotted_name)
    (relative_import)
  ] @source
  name: (aliased_import
    name: (dotted_name) @name
    alias: (identifier) @alias))
