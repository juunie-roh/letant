import Parser from "tree-sitter";

import { Trace } from "@/common/decorators";
import type {
  CaptureConfig,
  ConvertConfig,
  Edge,
  Node,
  NodePath,
  NodeSource,
  QueryConfig,
} from "@/models";
import type { PluginConfig } from "@/models/config";
import { assertPluginDescriptor, createCapture, createConvert } from "@/utils";
import { QueryMap } from "@/utils/query";

import CoreError from "./error";

declare namespace Plugin {
  export interface Descriptor<
    Q extends QueryConfig = QueryConfig,
    N extends Node = Node,
    E extends Edge = Edge,
  > {
    language: Parser.Language;
    /** File extensions this plugin can resolve import specifiers against. */
    extensions: string[];
    query: QueryMap<keyof Q & string>;
    captureConfig: CaptureConfig<Q>;
    convertConfig: ConvertConfig<Q, N, E>;
    references: (node: Parser.SyntaxNode) => Parser.SyntaxNode[];
  }
}

/**
 * Represents a loaded and initialized letant language plugin.
 */
class Plugin {
  private _config: PluginConfig;

  private _parser: Parser;

  private _module: Plugin.Descriptor;

  private _capture: ReturnType<typeof createCapture<QueryConfig>>;

  private _convert: ReturnType<typeof createConvert<QueryConfig, Node, Edge>>;

  private constructor(config: PluginConfig, descriptor: Plugin.Descriptor) {
    this._config = config;
    this._module = descriptor;

    this._capture = createCapture<QueryConfig>(
      this._module.query,
      this._module.captureConfig,
    );

    this._convert = createConvert<QueryConfig, Node, Edge>(
      this._capture,
      this._module.convertConfig,
    );

    this._parser = new Parser();
    this._parser.setLanguage(this._module.language);
  }

  static async create(config: PluginConfig): Promise<Plugin> {
    const descriptor = await Plugin.load(config.name);
    return new Plugin(config, descriptor);
  }

  static async load(name: string): Promise<Plugin.Descriptor> {
    let m: Record<string, unknown>;

    try {
      m = await import(name);
    } catch (e) {
      throw new CoreError(
        "CORE_PLUGIN_LOAD_FAILED",
        `Plugin "${name}" not found`,
        { cause: e },
      );
    }

    // the `import` always returns a module namespace object with `default`
    const descriptor = m.default as Plugin.Descriptor;

    assertPluginDescriptor(
      descriptor,
      name,
      new CoreError("CORE_PLUGIN_LOAD_FAILED", "Failed to load plugin"),
    );

    return descriptor;
  }

  get config(): PluginConfig {
    return this._config;
  }

  /**
   * The {@link Parser.Language | tree-sitter `Language`} instance used by this plugin.
   */
  get language() {
    return this._parser.getLanguage();
  }

  /**
   * File extensions this plugin can resolve import specifiers against.
   */
  get extensions(): string[] {
    return this._module.extensions;
  }

  /**
   * Parses a source file to the {@link Parser.Tree | tree-sitter tree}.
   * @param filePath Path to the source file to parse.
   * @param source String source to parse.
   * @param oldTree Previous tree for incremental parsing.
   * @param options Parsing options passed to tree-sitter.
   * @throws If the language plugin fails to parse the file.
   */
  @Trace({ label: "Plugin.Parse" })
  parse(
    source: string,
    oldTree?: Parser.Tree | null,
    options?: Parser.Options,
  ): Parser.Tree {
    try {
      return this._parser.parse(source, oldTree, options);
    } catch (e) {
      throw new CoreError(
        "CORE_PLUGIN_PARSE_FAILED",
        `Failed to parse source`,
        { cause: e },
      );
    }
  }

  references(node: Parser.SyntaxNode): Parser.SyntaxNode[] {
    return this._module.references(node);
  }

  @Trace({ label: "Plugin.extract" })
  extract(
    filePath: string,
    node: Parser.SyntaxNode,
  ): { edges: Edge[]; nodes: Node[] } {
    const captures = this._capture(node);
    const result = this._convert(captures, [filePath] as NodePath);
    // add root file node once
    result.nodes.push({
      path: [filePath] as NodePath,
      kind: "module",
      type: "scope",
      at: filePath as NodeSource,
      blockStartIndex: 0,
    });

    return result;
  }
}

export default Plugin;
