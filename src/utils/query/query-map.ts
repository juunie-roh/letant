import Parser from "tree-sitter";

import QueryError from "./error";

class QueryMap<K extends string> extends Map<K, Parser.Query> {
  private _language: Parser.Language;

  constructor(language: Parser.Language) {
    super();
    this._language = language;
  }

  /**
   * Adds a new {@link Parser.Query | query} instance initialized by value with a specified key to the map.
   * @param key A name of query to set.
   * @param value String of tree-sitter query.
   * @throws If the key is already set in the map.
   */
  set(key: K, value: string): this;

  /**
   * Adds a new {@link Parser.Query | query} instance with a specified key to the map.
   * @param key A name of query to set.
   * @param value A {@link Parser.Query | query} instance.
   * @throws If the key is already set in the map.
   */
  set(key: K, value: Parser.Query): this;

  set(key: K, value: string | Parser.Query): this {
    if (super.has(key)) {
      throw new QueryError(
        "QUERY_SET_DUPLICATE_KEY",
        `The key name ${key} already exists`,
      );
    }

    if (typeof value === "string") {
      const query = new Parser.Query(this._language, value);
      this.set(key, query);
    } else {
      super.set(key, value);
    }

    return this;
  }

  /**
   * Returns a specified {@link Parser.Query | query} instance from the map.
   * @param key A query name set to the map.
   * @throws If the key is not set in the map.
   */
  get(key: K): Parser.Query {
    if (!super.has(key)) {
      throw new QueryError(
        "QUERY_GET_INVALID_KEY",
        `No query found named ${key}`,
      );
    }

    return super.get(key)!;
  }
}

export default QueryMap;
