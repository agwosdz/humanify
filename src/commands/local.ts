import { cli } from "../cli.js";
import { llama } from "../plugins/local-llm-rename/llama.js";
import { DEFAULT_MODEL } from "../local-models.js";
import { unminify } from "../unminify.js";
import { unminifyWithCheckpoint } from "../unminify-with-checkpoint.js";
import prettier from "../plugins/prettier.js";
import babel from "../plugins/babel/babel.js";
import { localReanme } from "../plugins/local-llm-rename/local-llm-rename.js";
import { verbose } from "../verbose.js";
import { DEFAULT_CONTEXT_WINDOW_SIZE } from "./default-args.js";
import { parseNumber } from "../number-utils.js";
import { glob } from "tinyglobby";
import { err } from "../cli-error.js";

export const local = cli()
  .name("local")
  .description("Use a local LLM to unminify code")
  .showHelpAfterError(true)
  .option("-m, --model <model>", "The model to use", DEFAULT_MODEL)
  .option("-o, --outputDir <output>", "The output directory", "deobfuscated")
  .option(
    "-s, --seed <seed>",
    "Seed for the model to get reproduceable results (leave out for random seed)"
  )
  .option("--disableGpu", "Disable GPU acceleration")
  .option("--verbose", "Show verbose output")
  .option(
    "--contextSize <contextSize>",
    "The context size to use for the LLM",
    `${DEFAULT_CONTEXT_WINDOW_SIZE}`
  )
  .option("--checkpoint", "Enable checkpoint saving", false)
  .option("--resume", "Resume from last checkpoint", false)
  .option("-S, --skipExisting", "Skip processing if the deobfuscated file already exists", false)
  .argument("<inputs...>", "The input minified Javascript file(s) or glob patterns")
  .action(async (inputs: string[], opts) => {
    if (opts.verbose) {
      verbose.enabled = true;
    }

    verbose.log("Starting local inference with options: ", opts);

    const normalizedInputs = inputs.map(i => i.replace(/\\/g, '/'));
    const files = await glob(normalizedInputs, { absolute: true });
    if (files.length === 0) {
      err("No files found matching the provided inputs.");
    }

    const contextWindowSize = parseNumber(opts.contextSize);
    const prompt = await llama({
      model: opts.model,
      disableGpu: opts.disableGpu,
      seed: opts.seed ? parseInt(opts.seed) : undefined
    });

    const renamePlugin = localReanme(prompt, contextWindowSize);

    // Store config for checkpoint-aware version
    (renamePlugin as any).__config = {
      prompt,
      contextWindowSize
    };

    for (const filename of files) {
      if (opts.checkpoint || opts.resume) {
        await unminifyWithCheckpoint(filename, opts.outputDir, [
          babel,
          renamePlugin,
          prettier
        ], {
          enableCheckpoint: true,
          resumeFromCheckpoint: opts.resume,
          skipExisting: opts.skipExisting
        });
      } else {
        await unminify(filename, opts.outputDir, [
          babel,
          renamePlugin,
          prettier
        ], opts.skipExisting);
      }
    }
  });
