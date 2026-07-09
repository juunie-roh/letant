export type LetantErrorCode =
  // config
  | "CONFIG_INVALID_PATH"
  | "CONFIG_INVALID_SCHEMA"
  // core
  | "CORE_INVALID_ACCESS"
  | "CORE_NO_CONFIG"
  | "CORE_PLUGIN_LOAD_FAILED"
  | "CORE_PLUGIN_PARSE_FAILED"
  | "CORE_SYNTAX_ERROR"
  | "CORE_UNDEFINED_INSTANCE"
  | "CORE_UNREGISTERED_LANGUAGE"
  // tree
  | "TREE_NO_NODE"
  | "TREE_UNRESOLVED_EDGE"
  | "TREE_NAME_RESOLUTION_FAILED"
  | "TREE_UNDEFINED_INSTANCE"
  | "TREE_DUPLICATE_HASH"
  | "TREE_UNREGISTERED_NODE"
  // query
  | "QUERY_SET_DUPLICATE_KEY"
  | "QUERY_GET_INVALID_KEY"
  // workspace
  | "WORKSPACE_FILE_NOT_PARSED";

export class LetantError extends Error {
  readonly code: LetantErrorCode;

  constructor(code: LetantErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}
