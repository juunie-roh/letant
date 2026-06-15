import { describe, expect, it } from "vitest";

import { defined } from "./defined";
import { LetantError } from "./error";

describe("defined — boolean overload", () => {
  it("does not throw for true", () => {
    expect(() => defined(true)).not.toThrow();
  });

  it("throws for false", () => {
    expect(() => defined(false)).toThrow();
  });

  it("throws the provided SpineError for false", () => {
    const error = new LetantError("CORE_NO_CONFIG", "test");
    expect(() => defined(false, error)).toThrow(error);
  });

  it("throws a plain Error when no error provided for false", () => {
    expect(() => defined(false)).toThrow(Error);
  });
});

describe("defined — generic overload", () => {
  it("does not throw for a defined value", () => {
    expect(() => defined("hello")).not.toThrow();
    expect(() => defined(0)).not.toThrow();
    expect(() => defined("")).not.toThrow();
    expect(() => defined([])).not.toThrow();
    expect(() => defined({})).not.toThrow();
  });

  it("throws for null", () => {
    expect(() => defined(null)).toThrow();
  });

  it("throws for undefined", () => {
    expect(() => defined(undefined)).toThrow();
  });

  it("throws the provided SpineError for null", () => {
    const error = new LetantError("GRAPH_NO_NODE", "missing node");
    expect(() => defined(null, error)).toThrow(error);
  });

  it("throws the provided SpineError for undefined", () => {
    const error = new LetantError("GRAPH_NO_NODE", "missing node");
    expect(() => defined(undefined, error)).toThrow(error);
  });

  it("throws a plain Error when no error provided for null", () => {
    expect(() => defined(null)).toThrow(Error);
  });

  it("throws a plain Error when no error provided for undefined", () => {
    expect(() => defined(undefined)).toThrow(Error);
  });
});
