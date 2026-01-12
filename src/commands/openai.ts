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
  .argument("input", "The input minified Javascript file")
  .action(async (filename, opts) => {
    if (opts.verbose) {
      verbose.enabled = true;
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

    const renamePlugin = openaiRename({
      apiKey,
      baseURL,
      model: opts.model,
      contextWindowSize
    });

    // Store config for checkpoint-aware version
    (renamePlugin as any).__config = {
      apiKey,
      baseURL,
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
  });
