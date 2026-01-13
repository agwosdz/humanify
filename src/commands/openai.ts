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
import { existsSync, lstatSync, readFileSync } from "fs";
import { countIdentifiers } from "../plugins/local-llm-rename/visit-all-identifiers.js";
import { ReportManager } from "../report.js";

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
  .option("-S, --skipExisting", "Skip processing if the deobfuscated file already exists", false)
  .option("--distill", "Enable iterative logic distillation", false)
  .option("--verify", "Verify functional parity", false)
  .option("--registry <path>", "Specify path for rename registry")
  .option("-r, --recursive", "Recursively search for files in directories", false)
  .option("--resume", "Resume from last checkpoint", false)
  .argument("<inputs...>", "Input minified Javascript file(s) or glob patterns")
  .action(async (inputs: string[], opts) => {
    if (opts.verbose) {
      verbose.enabled = true;
    }

    const hasWildcardOrDirectory = inputs.some(i => {
      const p = i.replace(/\\/g, '/');
      return i.includes('*') || i.includes('?') || i.includes('[') || i.includes('{') || (existsSync(p) && lstatSync(p).isDirectory());
    });

    if (opts.recursive && !hasWildcardOrDirectory) {
      err("--recursive can only be used with directory or wildcard inputs.");
    }

    const normalizedInputs = inputs.map(i => {
      const p = i.replace(/\\/g, '/');
      if (opts.recursive) {
        if (existsSync(p) && lstatSync(p).isDirectory()) {
          return path.join(p, "**/*.js").replace(/\\/g, '/');
        }
        if (!p.includes("**")) {
          const lastSlash = p.lastIndexOf('/');
          if (lastSlash === -1) {
            return "**/" + p;
          } else {
            return p.slice(0, lastSlash) + "/**/" + p.slice(lastSlash + 1);
          }
        }
      }
      return p;
    });

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

    const reportManager = new ReportManager();
    console.log(`\nFound ${files.length} file(s) to process.`);
    const maxIds = opts.maxids ? parseInt(opts.maxids) : Infinity;

    for (let i = 0; i < files.length; i++) {
      const filename = files[i];
      console.log(`\n[${i + 1}/${files.length}] Processing: ${path.basename(filename)}`);

      try {
        const code = readFileSync(filename, "utf-8");
        const count = await countIdentifiers(code);

        if (count > maxIds) {
          console.log(`⚠️  Skipping ${path.basename(filename)}: Too many identifiers (${count} > ${maxIds})`);
          reportManager.addEntry({
            filename: path.basename(filename),
            status: "skipped",
            reason: `Exceeded maxids (${count} > ${maxIds})`,
            identifierCount: count
          });
          continue;
        }

        const relativePath = path.relative(process.cwd(), filename);
        const relativeDir = path.dirname(relativePath);
        const targetOutputDir = path.join(opts.outputDir, relativeDir);

        if (opts.checkpoint || opts.resume) {
          await unminifyWithCheckpoint(filename, targetOutputDir, [
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
          await unminify(filename, targetOutputDir, [
            babel,
            renamePlugin,
            prettier
          ], opts.skipExisting, opts.distill, opts.verify, opts.registry);
        }

        reportManager.addEntry({
          filename: path.basename(filename),
          status: "success",
          identifierCount: count
        });
      } catch (e: any) {
        console.error(`❌ Failed to process ${path.basename(filename)}:`, e.message);
        reportManager.addEntry({
          filename: path.basename(filename),
          status: "failed",
          reason: e.message
        });
      }
    }

    await reportManager.saveReport(opts.outputDir);
  });
