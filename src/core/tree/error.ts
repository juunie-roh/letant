import { LetantError, LetantErrorCode } from "@/common/error";

type TreeErrorCode = Extract<LetantErrorCode, `TREE_${string}`>;

class TreeError extends LetantError {
  constructor(code: TreeErrorCode, message: string, options?: ErrorOptions) {
    super(code, message, options);
  }
}

export default TreeError;
