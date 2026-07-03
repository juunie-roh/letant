#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { createCommand } from "@commander-js/extra-typings";
import { LetantError, Workspace } from "letant";
import { loadConfig } from "letant/config";

import pkg from "../package.json";
import { fileArg, othersArg } from "./args";
import queryCommand from "./commands/query";
import BinaryError from "./error";
import { group } from "./groups";
import { configOption, encodingOption, verboseOption } from "./options";

const program = createCommand()
  .name("letant")
  .version(
    pkg.version,
    "-v, --version",
    "Output the version of installed package",
  )
  .description(pkg.description)
  .addArgument(fileArg)
  .addArgument(othersArg)
  .addOption(configOption)
  .addOption(encodingOption)
  .addOption(verboseOption)
  .option("-o, --output <output>", "output file name")
  .option("--trace", "temp")
  .option("-r <row>", "temp")
  .option("-c <col>", "temp")
  .commandsGroup(group.command.dev)
  .addCommand(queryCommand)
  .action(async (file, others, options) => {
    const workspace = await Workspace.create(await loadConfig(options.config));
    const { graph } = workspace.openSource(
      file,
      readFileSync(file, options.encoding),
    );

    let data: any = graph.serialize();

    if (options.trace) {
      workspace.trace(file, {
        row: Number(options.r) ?? 0,
        column: Number(options.c) ?? 0,
      });
    }

    if (options.output) {
      writeFileSync(
        resolve(process.cwd(), options.output),
        JSON.stringify(data),
      );
    } else {
      // console.log(data);
    }

    if (others.length > 0) {
      others.forEach((f: string) => {
        // console.log(parser.parse(f));
      });
    }
  });

const badge = (label: string, color: string) =>
  `\x1b[${color}m\x1b[97m ${label} \x1b[0m`;

async function main() {
  try {
    await program.parseAsync();
  } catch (e) {
    const verbose = program.opts().verbose;
    if (e instanceof LetantError || e instanceof BinaryError) {
      process.stderr.write(`${badge(e.code, "41")} ${e.message}\n`);
      if (verbose) console.error(e);
    } else {
      const msg = e instanceof Error ? e.message : String(e);
      process.stderr.write(`${badge("ERROR", "41")} ${msg}\n`);
      if (verbose) console.error(e);
    }
    process.exit(1);
  }
}

void main();
