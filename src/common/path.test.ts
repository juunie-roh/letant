import path from "node:path";
import { cwd } from "node:process";

import { describe, expect, it } from "vitest";

import { normalizePath } from "./path";

const ROOT = "src/__mocks__";
const anchor = path.resolve(cwd(), ROOT);

describe("normalizePath", () => {
  describe("relative paths", () => {
    it("passes a plain relative path through unchanged", () => {
      expect(normalizePath(ROOT, "foo.ts")).toBe("foo.ts");
    });

    it("strips a leading ./", () => {
      expect(normalizePath(ROOT, "./foo.ts")).toBe("foo.ts");
    });

    it("preserves nested relative paths", () => {
      expect(normalizePath(ROOT, "a/b/c.ts")).toBe("a/b/c.ts");
    });
  });

  describe("absolute paths", () => {
    it("converts an absolute path inside rootDir to a relative one", () => {
      expect(normalizePath(ROOT, path.join(anchor, "foo.ts"))).toBe("foo.ts");
    });

    it("converts a nested absolute path to a relative one", () => {
      expect(normalizePath(ROOT, path.join(anchor, "a", "b.ts"))).toBe(
        path.join("a", "b.ts"),
      );
    });
  });

  describe("escape detection", () => {
    it("throws for a relative path that escapes rootDir", () => {
      expect(() => normalizePath(ROOT, "../../secret.ts")).toThrow();
    });

    it("throws for an absolute path outside rootDir", () => {
      expect(() =>
        normalizePath(ROOT, path.resolve("/tmp/secret.ts")),
      ).toThrow();
    });
  });
});
