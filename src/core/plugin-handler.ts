import { existsSync } from "node:fs";
import path from "node:path";
import { cwd } from "node:process";

import type Parser from "tree-sitter";

import { Trace } from "@/common/decorators";
import { defined } from "@/common/defined";
import { normalizePath } from "@/common/path";
import { Node } from "@/models";
import type { Config, PluginConfig } from "@/models/config";

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
  private _config: Config;

  private _languagePlugins: Map<string, Plugin>;

  private constructor(config: Config, languagePlugins: Map<string, Plugin>) {
    this._config = config;
    this._languagePlugins = languagePlugins;
  }

  static async create(config: Config): Promise<PluginHandler> {
    const languagePlugins = new Map<string, Plugin>();

    await Promise.all(
      config.plugins.map(async (pluginConfig) => {
        const plugin = await Plugin.create(pluginConfig);
        for (const ext of pluginConfig.extensions) {
          languagePlugins.set(ext, plugin);
        }
      }),
    );

    return new PluginHandler(config, languagePlugins);
  }

  get config(): Config {
    return this._config;
  }

  /**
   * {@link Plugin | letant `Plugin`} instances keyed by file extension.
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
    const resolved = this.resolvePaths(filePath, nodes, plugin);

    return {
      graph: new Graph(resolved, edges, filePath),
      tree,
      ext,
    };
  }

  /**
   * Resolves import specifiers on binding nodes to workspace-relative paths
   * that exist on disk, so results are directly navigable. Specifiers that
   * cannot be resolved to a real file (bare specifiers, unmatched aliases)
   * are left untouched.
   */
  resolvePaths(filePath: string, nodes: Node[], plugin: Plugin): Node[] {
    return nodes.map((node) => {
      if (!("name" in node.at)) return node;

      const resolved = this._resolveImportPath(
        node.at.name,
        filePath,
        plugin.extensions,
        plugin.config.paths,
      );

      if (resolved === null) return node;

      return { ...node, at: { ...node.at, name: resolved } };
    });
  }

  /**
   * @returns A workspace-relative path that exists on disk, or `null` if
   * `importPath` cannot be resolved (bare specifier, unmatched alias, or no
   * matching extension found on disk).
   */
  private _resolveImportPath(
    importPath: string,
    filePath: string,
    extensions: string[],
    paths?: PluginConfig["paths"],
  ): string | null {
    const rootDir = this._config.rootDir ?? ".";
    const anchor = path.resolve(cwd(), rootDir);

    // 1. relative to the importing file
    if (importPath.startsWith("./") || importPath.startsWith("../")) {
      const abs = path.resolve(anchor, path.dirname(filePath), importPath);
      return this._probeExtensions(abs, rootDir, extensions);
    }

    // 2. alias substitution
    if (paths) {
      for (const [alias, targets] of Object.entries(paths)) {
        const prefix = alias.endsWith("/*") ? alias.slice(0, -1) : alias;
        if (!importPath.startsWith(prefix)) continue;

        for (const target of targets) {
          const targetPrefix = target.endsWith("/*")
            ? target.slice(0, -1)
            : target;
          const substituted = targetPrefix + importPath.slice(prefix.length);
          const abs = path.resolve(anchor, substituted);

          const resolved = this._probeExtensions(abs, rootDir, extensions);
          if (resolved !== null) return resolved;
        }

        return null;
      }
    }

    // 3. absolute path, possibly under rootDir
    if (path.isAbsolute(importPath)) {
      return this._probeExtensions(importPath, rootDir, extensions);
    }

    // 4. bare specifier — external, leave as-is
    return null;
  }

  /**
   * Tries `candidate` as-is, then with each of `extensions` appended, and
   * returns the first path that exists on disk, normalized relative to
   * `rootDir`. Returns `null` if none exist, or if the match falls outside
   * `rootDir`.
   */
  private _probeExtensions(
    candidate: string,
    rootDir: string,
    extensions: string[],
  ): string | null {
    const match = [candidate, ...extensions.map((ext) => candidate + ext)].find(
      existsSync,
    );

    if (!match) return null;

    try {
      return normalizePath(rootDir, match);
    } catch {
      return null;
    }
  }

  @Trace({ label: "PluginHandler.references" })
  references(node: Parser.SyntaxNode, ext: string): Parser.SyntaxNode[] {
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
