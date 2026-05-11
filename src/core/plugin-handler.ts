import path from "node:path";

import type Parser from "tree-sitter";

import { Trace } from "@/common/decorators";
import { defined } from "@/common/defined";
import type { Config } from "@/models/config";

import CoreError from "./error";
import Graph from "./graph";
import Plugin from "./plugin";

declare namespace PluginHandler {
  export type ParseResult = {
    /** A graph constructed from the result converted by plugin. */
    graph: Graph;
    /** Raw AST parsed by tree-sitter. */
    tree: Parser.Tree;
    /** The extension of the parsed file. */
    ext: string;
  };
}

class PluginHandler {
  private _languagePlugins: Map<string, Plugin>;

  private constructor(languagePlugins: Map<string, Plugin>) {
    this._languagePlugins = languagePlugins;
  }

  static async create(config: Config): Promise<PluginHandler> {
    const languagePlugins = new Map<string, Plugin>();

    await Promise.all(
      config.language.map(async (c) => {
        const plugin = await Plugin.create(c.name);
        for (const ext of c.extensions) {
          languagePlugins.set(ext, plugin);
        }
      }),
    );

    return new PluginHandler(languagePlugins);
  }

  /**
   * {@link Plugin | spine `Language`} instances keyed by file extension.
   */
  get plugins(): ReadonlyMap<string, Plugin> {
    return this._languagePlugins;
  }

  /**
   * Parses a source file using the language registered for its file extension.
   * @param filePath Path to the source file to parse.
   * @param source String source to parse.
   * @param oldTree Previous tree for incremental parsing.
   * @param options {@link Parser.Options | Parsing options} passed to tree-sitter.
   * @throws If the file has any syntax error.
   */
  @Trace({ label: "PluginHandler.Parse" })
  parse(
    filePath: string,
    source: string,
    oldTree?: Parser.Tree | null,
    options?: Parser.Options,
  ): PluginHandler.ParseResult {
    const { plugin, ext } = this._getPlugin(filePath);
    const tree = plugin.parse(source, oldTree, options);

    if (tree.rootNode.hasError) {
      throw new CoreError("CORE_SYNTAX_ERROR", `Syntax error in "${filePath}"`);
    }

    const { nodes, edges } = plugin.extract(filePath, tree.rootNode);

    return {
      graph: new Graph(nodes, edges, filePath),
      tree,
      ext,
    };
  }

  @Trace({ label: "PluginHandler.references" })
  references(node: Parser.SyntaxNode, ext: string): string[] {
    if (!this.plugins.has(ext))
      throw new CoreError(
        "CORE_UNREGISTERED_LANGUAGE",
        `Unregistered: language for "${ext}" not registered in configuration`,
      );

    const plugin = this.plugins.get(ext);
    defined(plugin);

    return plugin.references(node);
  }

  /**
   * Cleans up all registered language resources.
   */
  destroy(): void {
    this._languagePlugins.clear();
  }

  /**
   * @param filePath Path to the source file to parse.
   * @throws If no language is registered for the file's extension.
   * @throws If the language is registered but cannot be found in runtime.
   */
  private _getPlugin(filePath: string): { plugin: Plugin; ext: string } {
    const ext = path.extname(filePath);
    if (!this.plugins.has(ext))
      throw new CoreError(
        "CORE_UNREGISTERED_LANGUAGE",
        `Unregistered: language for "${ext}" not registered in configuration`,
      );

    const plugin = this.plugins.get(ext);
    defined(
      plugin,
      new CoreError(
        "CORE_UNDEFINED_INSTANCE",
        `Undefined language corresponding ${ext}`,
      ),
    );

    return { plugin, ext };
  }
}

export default PluginHandler;
