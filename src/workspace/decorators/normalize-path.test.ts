import { describe, expect, it } from "vitest";

import { LetantError } from "@/common/error";

import NormalizePath from "./normalize-path";

const ROOT = "src/__mocks__";

function makeHost(rootDir: string) {
  class Host {
    rootDir = rootDir;
    @NormalizePath
    receive(filePath: string): string {
      return filePath;
    }
  }
  return new Host();
}

describe("NormalizePath", () => {
  it("normalizes the first argument before passing it to the method", () => {
    expect(makeHost(ROOT).receive("./foo.ts")).toBe("foo.ts");
  });

  it("forwards additional arguments unchanged", () => {
    class Host {
      rootDir = ROOT;
      @NormalizePath
      receive(filePath: string, encoding: string): string {
        return `${filePath}:${encoding}`;
      }
    }
    expect(new Host().receive("./foo.ts", "utf-8")).toBe("foo.ts:utf-8");
  });

  it("throws LetantError when the path escapes rootDir", () => {
    expect(() => makeHost(ROOT).receive("../../secret.ts")).toThrow(
      LetantError,
    );
  });
});
