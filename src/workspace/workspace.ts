import { readFile } from "node:fs/promises";
import path from "node:path";
import { cwd } from "node:process";

import Parser from "tree-sitter";

import { isNodeSource, NodePath, NodeSource } from "@/common/branded-types";
import { Trace } from "@/common/decorators";
import { GraphCursor, PluginHandler } from "@/core";
import type { Config, Offset } from "@/models";

import { NormalizePath } from "./decorators";
import WorkspaceError from "./error";

class Workspace {
  private _config: Config;
  private _handler: PluginHandler;
  private _files: Map<string, PluginHandler.ParseResult>;

  private constructor(config: Config, handler: PluginHandler) {
    this._config = config;
    this._handler = handler;
    this._files = new Map();
  }

  static async create(config: Config): Promise<Workspace> {
    const handler = await PluginHandler.create(config);
    return new Workspace(config, handler);
  }

  get config(): Config {
    return this._config;
  }

  get rootDir(): string {
    return this._config.rootDir ?? ".";
  }

  @NormalizePath
  @Trace({ label: "Workspace.openSource" })
  openSource(filePath: string, source: string): PluginHandler.ParseResult {
    const parsed = this._handler.parse(filePath, source);
    this._files.set(filePath, parsed);
    return parsed;
  }

  @NormalizePath
  @Trace({ label: "Workspace.openFile" })
  async openFile(
    filePath: string,
    encoding: BufferEncoding = "utf-8",
  ): Promise<PluginHandler.ParseResult> {
    const fp = path.resolve(cwd(), this.rootDir, filePath);
    const src = await readFile(fp, { encoding });
    const parsed = this._handler.parse(filePath, src);
    this._files.set(filePath, parsed);
    return parsed;
  }

  @NormalizePath
  get(filePath: string): PluginHandler.ParseResult {
    const parsed = this._files.get(filePath);
    if (!parsed) {
      throw new WorkspaceError(
        "WORKSPACE_FILE_NOT_PARSED",
        `"${filePath}" has not been opened.`,
      );
    }
    return parsed;
  }

  @NormalizePath
  has(filePath: string): boolean {
    return this._files.has(filePath);
  }

  /**
   * Top-level names declared in each opened file, keyed by
   * workspace-relative file path. These are the only names referable
   * across files.
   */
  topLevelNames(): Map<string, string[]> {
    const result = new Map<string, string[]>();
    for (const [filePath, { graph }] of this._files) {
      result.set(filePath, graph.topLevelNames());
    }
    return result;
  }

  /**
   * Positional entry: the innermost scope containing the offset. One level
   * of disclosure is `at(...).children()`; what to explore further is the
   * user's decision.
   * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0004-output-interface.md ADR-0004}
   */
  @NormalizePath
  at(filePath: string, offset: Offset): GraphCursor {
    const { graph } = this.get(filePath);
    return GraphCursor.at(graph, offset);
  }

  /**
   * The pointed genealogical query: where did the name at this position
   * come from?.
   *
   * Auto-follows import bindings while their source file is already opened
   * (explored territory); stops at the frontier otherwise.
   *
   * @returns A {@link GraphCursor} at the declaration (its `at` is a local
   * range, possibly in another file — see `cursor.root`), the
   * {@link NodeSource} of the next file to open (frontier), or `undefined`
   * when the name cannot be resolved.
   * @see {@link https://github.com/juunie-roh/letant/blob/main/docs/architecture/decisions/0004-output-interface.md ADR-0004}
   */
  @NormalizePath
  @Trace({ label: "Workspace.origin" })
  origin(
    filePath: string,
    offset: Offset,
  ): GraphCursor | NodeSource | undefined {
    const { graph, tree } = this.get(filePath);

    const target =
      typeof offset === "number"
        ? tree.rootNode.descendantForIndex(offset)
        : tree.rootNode.descendantForPosition(offset);

    let resolved = GraphCursor.at(graph, offset).resolve(target.text);

    const visited = new Set<string>([filePath]);

    while (resolved) {
      const { at, props } = resolved.node;
      // local declaration — position acquired
      if (!isNodeSource(at)) return resolved;
      // frontier — the source file has not been opened
      if (!this.has(at)) return at;
      // cycle in re-export chain
      if (visited.has(at)) return undefined;
      visited.add(at);

      const name =
        typeof props?.alias_of === "string" ? props.alias_of : resolved.name;
      const { graph: next } = this.get(at);
      const path = NodePath([at, name]);

      resolved = next.getNode(path) ? new GraphCursor(next, path) : undefined;
    }

    return undefined;
  }

  @NormalizePath
  @Trace({ label: "Workspace.trace" })
  trace(filePath: string, offset: Offset) {
    const { ext, cursor, node } = this._syncOffset(filePath, offset);

    const references = new Set(this._handler.references(node, ext));

    const resolved = new Map<
      string,
      { cursor: GraphCursor | undefined; refs: Set<Parser.SyntaxNode> }
    >();

    for (const ref of references) {
      const resolvedCursor = cursor.resolve(ref.text);
      const key = resolvedCursor?.toString() ?? "";

      if (!resolved.has(key)) {
        resolved.set(key, { cursor: resolvedCursor, refs: new Set() });
      }

      resolved.get(key)!.refs.add(ref);
    }

    console.log("total:", references.size, "references");

    resolved.forEach(({ cursor: c, refs }) => {
      if (!c) {
        console.log("unresolved");
      } else {
        console.log(`(${c.node.kind})`, c.name, c.toString());
      }

      refs.forEach((node) => {
        console.log(
          `    ${node.text} (${filePath}:${node.startPosition.row + 1}:${node.startPosition.column + 1})`,
        );
      });
    });

    return resolved;
  }

  @Trace({
    label: "Workspace.destroy",
    message: "Workspace Destroyed",
  })
  destroy(): void {
    this._handler.destroy();
    this._files.clear();
  }

  /**
   * Synchronize a node with given offset.
   */
  @Trace({ label: "Workspace._syncOffset" })
  private _syncOffset(
    filePath: string,
    offset: Offset,
  ): {
    ext: string;
    cursor: GraphCursor;
    node: Parser.SyntaxNode;
  } {
    const { graph, tree, ext } = this.get(filePath);
    const cursor = GraphCursor.at(graph, offset);

    // the cursor always lands on a scope — start at its inner block
    const o = cursor.node.blockStartIndex ?? 0;

    const node = tree.rootNode.descendantForIndex(o).parent ?? tree.rootNode;

    return {
      ext,
      cursor,
      node,
    };
  }
}

export default Workspace;
