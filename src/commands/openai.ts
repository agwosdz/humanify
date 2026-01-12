import { cli } from "../cli.js";
import prettier from "../plugins/prettier.js";
import { unminify } from "../unminify.js";
import { unminifyWithCheckpoint } from "../unminify-with-checkpoint.js";
import babel from "../plugins/babel/babel.js";
import { openaiRename } from "../plugins/openai/openai-rename.js";
import { verbose } from "../verbose.js";
import { env } from "../env.js";
import { parseNumber } from "../number-utils.js";
import { DEFAULT_CONTEXT_WINDOW_SIZE } from "./default-args.js";
import { glob } from "tinyglobby";
import { err } from "../cli-error.js";
import path from "path";
import { CheckpointManager } from "../checkpoint.js";
import { openaiRenameWithCheckpoint } from "../plugins/openai/openai-rename-with-checkpoint.js";
import { findProjectRoot } from "../file-utils.js";
import { logRunSummary } from "../verbose.js";

export const openai = cli()
  .name("openai")
  .description("Use OpenAI's API to unminify code")
  .option("-m, --model <model>", "The model to use", "gpt-4o-mini")
  .option("-o, --outputDir <output>", "The output directory", "deobfuscated")
  .option(
    "-k, --apiKey <apiKey>",
    "The OpenAI API key. Alternatively use OPENAI_API_KEY environment variable"
  )
  .option(
    "--baseURL <baseURL>",
    "The OpenAI base server URL.",
    env("OPENAI_BASE_URL") ?? "https://api.openai.com/v1"
  )
  .option("--verbose", "Show verbose output")
  .option(
    "--contextSize <contextSize>",
    "The context size to use for the LLM",
    `${DEFAULT_CONTEXT_WINDOW_SIZE}`
  )
  .option("--checkpoint", "Enable checkpoint saving", false)
  .option("--resume", "Resume from last checkpoint", false)
  .option("-S, --skipExisting", "Skip processing if the deobfuscated file already exists", false)
  .option("--distill", "Enable iterative logic distillation (high quality but slower)", false)
  .option("--verify", "Verify functional parity between original and unminified code", false)
  .option("--registry <path>", "Specify an explicit path for the rename registry")
  .argument("<inputs...>", "The input minified Javascript file(s) or glob patterns")
  .action(async (inputs: string[], opts) => {
    if (opts.verbose) {
      verbose.enabled = true;
    }

    const normalizedInputs = inputs.map(i => i.replace(/\\/g, '/'));
    const files = await glob(normalizedInputs, { absolute: true });

    const finalRegistryPath = opts.registry || path.join(findProjectRoot(process.cwd()), ".humanify-registry.json");
    logRunSummary("OpenAI Rename", opts, finalRegistryPath);

    if (files.length === 0) {
      err("No files found matching the provided inputs.");
    }

    const apiKey = opts.apiKey ?? env("OPENAI_API_KEY");
    const baseURL = opts.baseURL;
    const contextWindowSize = parseNumber(opts.contextSize);

    interface PluginConfig {
      apiKey: string;
      baseURL: string;
      model: string;
      contextWindowSize: number;
    }

    let renamePlugin;
    if (opts.checkpoint) {
      const checkpointManager = new CheckpointManager(opts.outputDir);
      renamePlugin = openaiRenameWithCheckpoint({
        apiKey,
        baseURL,
        model: opts.model,
        contextWindowSize,
        checkpointManager
      });
    } else {
      renamePlugin = openaiRename({
        apiKey,
        baseURL,
        model: opts.model,
        contextWindowSize
      });
    }

    console.log(`\nFound ${files.length} file(s) to process.`);

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      console.log(`\n[${i + 1}/${files.length}] Processing: ${path.basename(filename)}`);

      if (opts.checkpoint || opts.resume) {
        await unminifyWithCheckpoint(filename, opts.outputDir, [
          babel,
          renamePlugin,
          prettier
        ], {
          enableCheckpoint: true,
          resumeFromCheckpoint: opts.resume,
          skipExisting: opts.skipExisting,
          enableDistill: opts.distill,
          enableVerify: opts.verify,
          registryPath: opts.registry
        });
      } else {
        await unminify(filename, opts.outputDir, [
          babel,
          renamePlugin,
          prettier
        ], opts.skipExisting, opts.distill, opts.verify, opts.registry);
      }
    }
  });
