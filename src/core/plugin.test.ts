import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PluginConfig } from "@/models";
import { QueryMap } from "@/utils/query";

import CoreError from "./error";
import Plugin from "./plugin";

// ---------------------------------------------------------------------------
// Mock tree-sitter so no native binaries are required
// ---------------------------------------------------------------------------

const mockParse = vi.fn(() => ({ rootNode: { type: "program" } }));
const mockSetLanguage = vi.fn();

vi.mock("tree-sitter", () => ({
  default: vi.fn(function () {
    let _lang: unknown;
    return {
      parse: mockParse,
      setLanguage: (l: unknown) => {
        mockSetLanguage(l);
        _lang = l;
      },
      getLanguage: () => _lang,
    };
  }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const VALID_PLUGIN_CONFIG: PluginConfig = {
  name: "@letant/js",
  extensions: [".js", ".jsx"],
};

const validLangShape = {
  name: "typescript",
  language: 0,
  nodeTypeInfo: [],
} as unknown as import("tree-sitter").Language;

function mockQueryMap(): QueryMap<string> {
  return new QueryMap<string>(validLangShape);
}

function mockDescriptor() {
  return {
    language: validLangShape,
    query: mockQueryMap(),
    captureConfig: {},
    convertConfig: {},
    references: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// Plugin.load()
// ---------------------------------------------------------------------------

describe("Plugin.load()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("rejects when the module cannot be imported", async () => {
    await expect(Plugin.load("@letant/nonexistent")).rejects.toThrow(CoreError);
  });

  describe("module resolution", () => {
    beforeEach(() => {
      vi.resetModules();
    });

    it("uses m.default to resolve the descriptor", async () => {
      const descriptor = mockDescriptor();
      vi.doMock("plugin-esm", () => ({ default: descriptor }));
      const result = await Plugin.load("plugin-esm");
      expect(result).toBe(descriptor);
    });
  });

  describe("with a valid plugin", () => {
    it("returns a Plugin.Descriptor with the expected shape", async () => {
      vi.spyOn(Plugin, "load").mockResolvedValue(
        mockDescriptor() as Plugin.Descriptor,
      );

      const descriptor = await Plugin.load(VALID_PLUGIN_CONFIG.name);

      expect(descriptor.query).toBeInstanceOf(QueryMap);
      expect(descriptor.captureConfig).toBeDefined();
      expect(descriptor.convertConfig).toBeDefined();
      expect(descriptor.language).toMatchObject({ name: expect.any(String) });
      expect(descriptor.references).toBeDefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Plugin (class)
// ---------------------------------------------------------------------------

describe("Plugin", () => {
  let plugin: Plugin;

  beforeEach(async () => {
    vi.spyOn(Plugin, "load").mockResolvedValue(
      mockDescriptor() as Plugin.Descriptor,
    );
    plugin = await Plugin.create(VALID_PLUGIN_CONFIG);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    mockParse.mockReset();
    mockParse.mockReturnValue({ rootNode: { type: "program" } });
  });

  describe("language getter", () => {
    it("returns the language object from the loaded module", () => {
      expect(plugin.language).toMatchObject({ name: expect.any(String) });
    });
  });

  describe("parse()", () => {
    it("returns a tree for valid source", () => {
      const tree = plugin.parse("const x = 1;");
      expect(tree.rootNode.type).toBe("program");
    });

    it("wraps parser errors in CoreError with CORE_PLUGIN_PARSE_FAILED", () => {
      mockParse.mockImplementation(() => {
        throw new Error("internal parse error");
      });

      try {
        plugin.parse("");
        expect.unreachable("should have thrown");
      } catch (e) {
        expect(e).toBeInstanceOf(CoreError);
        expect((e as CoreError).code).toBe("CORE_PLUGIN_PARSE_FAILED");
        expect((e as CoreError).message).toContain("Failed");
      }
    });
  });

  describe("references()", () => {
    it("delegates to _module.references", async () => {
      const descriptor = mockDescriptor();
      vi.spyOn(Plugin, "load").mockResolvedValue(
        descriptor as Plugin.Descriptor,
      );
      const p = await Plugin.create(VALID_PLUGIN_CONFIG);
      const node = {} as import("tree-sitter").SyntaxNode;
      p.references(node);
      expect(descriptor.references).toHaveBeenCalledWith(node);
    });
  });

  describe("extract()", () => {
    it("returns nodes and edges arrays for a parsed source", () => {
      const tree = plugin.parse("export function greet() {}");
      const result = plugin.extract("greet.ts", tree.rootNode);

      expect(Array.isArray(result.nodes)).toBe(true);
      expect(Array.isArray(result.edges)).toBe(true);
    });
  });
});
