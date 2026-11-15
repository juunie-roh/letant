import Parser from "tree-sitter";

import { NodePath, NodeSource } from "@/common/branded-types";
import { Trace } from "@/common/decorators";
import type { Node } from "@/models";
import type { PluginConfig } from "@/models/config";
import { assertPluginDescriptor } from "@/utils";

import CoreError from "./error";

declare namespace Plugin {
  export interface Descriptor<N extends Node = Node> {
    language: Parser.Language;
    /** File extensions this plugin can resolve import specifiers against. */
    extensions: string[];
    /**
     * Every scope and binding of a file, from its root at any depth
     * (ADR 0006). Paths start with `rootPath`; the node of the root itself
     * is left out, core adds it.
     */
    extract: (root: Parser.SyntaxNode, rootPath: NodePath) => N[];
    references: (node: Parser.SyntaxNode) => Parser.SyntaxNode[];
    /**
     * The name a reference looks up, where it is not the text at its
     * position (a language that rewrites or normalizes names). Asked for a
     * node `references` returned (ADR 0007).
     */
    nameOf?: (node: Parser.SyntaxNode) => string;
    /**
     * The {@link Node.space | spaces} a reference's name may be bound in,
     * where the language has more than values. Asked for a node `references`
     * returned.
     */
    spacesOf?: (node: Parser.SyntaxNode) => readonly string[] | undefined;
    /**
     * Declines a reference the tree would resolve incorrectly, with the rule
     * that makes it so. Asked for a node `references` returned (ADR 0007).
     */
    unsupported?: (node: Parser.SyntaxNode) => string | undefined;
  }
}

/**
 * Represents a loaded and initialized letant language plugin.
 */
class Plugin {
  private _config: PluginConfig;

  private _parser: Parser;

  private _module: Plugin.Descriptor;

  private constructor(config: PluginConfig, descriptor: Plugin.Descriptor) {
    this._config = config;
    this._module = descriptor;

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

  nameOf(node: Parser.SyntaxNode): string {
    return this._module.nameOf?.(node) ?? node.text;
  }

  unsupported(node: Parser.SyntaxNode): string | undefined {
    return this._module.unsupported?.(node);
  }

  spacesOf(node: Parser.SyntaxNode): readonly string[] | undefined {
    return this._module.spacesOf?.(node);
  }

  @Trace({ label: "Plugin.extract" })
  extract(filePath: string, node: Parser.SyntaxNode): { nodes: Node[] } {
    const rootPath = NodePath([filePath]);
    const nodes = this._module.extract(node, rootPath);
    // add root file node once
    nodes.push({
      path: rootPath,
      kind: "module",
      type: "scope",
      at: NodeSource(filePath),
      blockStartIndex: 0,
    });

    return { nodes };
  }
}

export default Plugin;
