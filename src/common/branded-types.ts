declare const __brand: unique symbol;

/**
 * @template T A type to make a brand on.
 * @template K A name of brand.
 * @example
 * type NodeId = Branded<string, "NodeId"> // NodeId = string & { readonly __brand: "NodeId" }
 */
export type Branded<T, K extends string> = T & { [__brand]: K };

/**
 * Intra-graph node id. Ephemeral — minted per {@link Graph} instance,
 * never persisted or compared across graphs. See ADR 0002.
 */
export type NodeId = Branded<number, "NODE_ID">;

export function NodeId(value: number): NodeId {
  return value as NodeId;
}

export type NodePath = Branded<string[], "NODE_PATH">;

export function NodePath(value: string[]): NodePath {
  return value as NodePath;
}

/**
 * @returns Whether the value is a {@link NodePath}: a non-empty array of
 * string segments.
 */
export function isNodePath(value: unknown): value is NodePath {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((segment) => typeof segment === "string")
  );
}

export type NodeSource = Branded<string, "NODE_SOURCE">;

export function NodeSource(value: string): NodeSource {
  return value as NodeSource;
}

/**
 * @returns Whether the value is a {@link NodeSource}. Discriminates the
 * `Node["at"]` union: a source is a string, a local range is an object.
 */
export function isNodeSource(value: unknown): value is NodeSource {
  return typeof value === "string";
}
