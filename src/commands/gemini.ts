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
  .argument("input", "The input minified Javascript file")
  .action(async (filename, opts) => {
    if (opts.verbose) {
      verbose.enabled = true;
    }

    const apiKey = opts.apiKey ?? env("GEMINI_API_KEY");
    const contextWindowSize = parseNumber(opts.contextSize);

    const renamePlugin = geminiRename({
      apiKey,
      model: opts.model,
      contextWindowSize
    });

    // Store config for checkpoint-aware version
    (renamePlugin as any).__config = {
      apiKey,
      model: opts.model,
      contextWindowSize
    };

    if (opts.checkpoint || opts.resume) {
      await unminifyWithCheckpoint(filename, opts.outputDir, [
        babel,
        renamePlugin,
        prettier
      ], {
        enableCheckpoint: true,
        resumeFromCheckpoint: opts.resume
      });
    } else {
      await unminify(filename, opts.outputDir, [
        babel,
        renamePlugin,
        prettier
      ]);
    }
  });
