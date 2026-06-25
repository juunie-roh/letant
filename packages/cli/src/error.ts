type BinaryErrorCode =
  | "BIN_MODULE_NOT_FOUND"
  | "BIN_INVALID_OPTION"
  | "BIN_INVALID_LANGUAGE";

class BinaryError extends Error {
  readonly code: BinaryErrorCode;

  constructor(code: BinaryErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
    this.code = code;
  }
}

export default BinaryError;
