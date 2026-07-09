/**
 * Construct a type with the properties of T except for those in union type K.
 */
export type UnionOmit<T, K extends keyof T> = T extends unknown
  ? Omit<T, K>
  : never;

// "a.b" → "a"
export type Head<T extends string> = T extends `${infer L}.${string}` ? L : T;
// "a.b" → "b"
export type Tail<T extends string> = T extends `${string}.${infer R}` ? R : T;
