export interface Config {
  /**
   * The base directory for the workspace. All file paths emitted into the
   * scope graph are resolved relative to this.
   *
   * @default process.cwd()
   */
  rootDir?: string;
  /**
   * An array of configurations for each language plugins.
   */
  plugins: PluginConfig[];
}

export interface PluginConfig {
  name: string;
  extensions: string[];
  paths?: {
    [alias: string]: RelativePath[];
  };
}

type RelativePath = `./${string}` | `../${string}`;
