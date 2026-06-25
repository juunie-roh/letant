export type LetantErrorCode =
  // config
  | "CONFIG_INVALID_PATH"
  | "CONFIG_INVALID_SCHEMA"
  // core
  | "CORE_NO_CONFIG"
  | "CORE_UNREGISTERED_LANGUAGE"
  | "CORE_SYNTAX_ERROR"
  | "CORE_UNDEFINED_INSTANCE"
  | "CORE_PLUGIN_LOAD_FAILED"
  | "CORE_PLUGIN_PARSE_FAILED"
  // graph
  | "GRAPH_NO_NODE"
  | "GRAPH_UNRESOLVED_EDGE"
  | "GRAPH_NAME_RESOLUTION_FAILED"
  | "GRAPH_UNDEFINED_INSTANCE"
  | "GRAPH_DUPLICATE_HASH"
  | "GRAPH_UNREGISTERED_NODE"
  // query
  | "QUERY_SET_DUPLICATE_KEY"
  | "QUERY_GET_INVALID_KEY"
  // workspace
  | "WORKSPACE_FILE_NOT_PARSED"
  | "WORKSPACE_INVALID_ACCESS";

export class LetantError extends Error {
  readonly code: LetantErrorCode;

  constructor(code: LetantErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}
