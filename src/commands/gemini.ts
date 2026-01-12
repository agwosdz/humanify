import { cli } from "../cli.js";
import prettier from "../plugins/prettier.js";
import { unminify } from "../unminify.js";
import { unminifyWithCheckpoint } from "../unminify-with-checkpoint.js";
import babel from "../plugins/babel/babel.js";
import { verbose } from "../verbose.js";
import { geminiRename } from "../plugins/gemini-rename.js";
import { env } from "../env.js";
import { DEFAULT_CONTEXT_WINDOW_SIZE } from "./default-args.js";
import { parseNumber } from "../number-utils.js";
import { glob } from "tinyglobby";
import { err } from "../cli-error.js";
import path from "path";
import { CheckpointManager } from "../checkpoint.js";
import { geminiRenameWithCheckpoint } from "../plugins/gemini-rename-with-checkpoint.js";
import { findProjectRoot } from "../file-utils.js";
import { logRunSummary } from "../verbose.js";

export const azure = cli()
  .name("gemini")
  .description("Use Google Gemini/AIStudio API to unminify code")
  .option("-m, --model <model>", "The model to use", "gemini-1.5-flash")
  .option("-o, --outputDir <output>", "The output directory", "deobfuscated")
  .option(
    "--contextSize <contextSize>",
    "The context size to use for the LLM",
    `${DEFAULT_CONTEXT_WINDOW_SIZE}`
  )
  .option(
    "-k, --apiKey <apiKey>",
    "The Google Gemini/AIStudio API key. Alternatively use GEMINI_API_KEY environment variable"
  )
  .option("--verbose", "Show verbose output")
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
    logRunSummary("Gemini Rename", opts, finalRegistryPath);

    if (files.length === 0) {
      err("No files found matching the provided inputs.");
    }

    const apiKey = opts.apiKey ?? env("GEMINI_API_KEY");
    const contextWindowSize = parseNumber(opts.contextSize);

    let renamePlugin;
    if (opts.checkpoint) {
      const checkpointManager = new CheckpointManager(opts.outputDir);
      renamePlugin = geminiRenameWithCheckpoint({
        apiKey,
        model: opts.model,
        checkpointManager,
        contextWindowSize
      });
    } else {
      renamePlugin = geminiRename({
        apiKey,
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
