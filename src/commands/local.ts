import { cli } from "../cli.js";
import { llama } from "../plugins/local-llm-rename/llama.js";
import { DEFAULT_MODEL } from "../local-models.js";
import { unminify } from "../unminify.js";
import { unminifyWithCheckpoint } from "../unminify-with-checkpoint.js";
import prettier from "../plugins/prettier.js";
import babel from "../plugins/babel/babel.js";
import { localReanme } from "../plugins/local-llm-rename/local-llm-rename.js";
import { verbose, logRunSummary } from "../verbose.js";
import { DEFAULT_CONTEXT_WINDOW_SIZE } from "./default-args.js";
import { parseNumber } from "../number-utils.js";
import { glob } from "tinyglobby";
import { err } from "../cli-error.js";
import path from "path";
import { CheckpointManager } from "../checkpoint.js";
import { localRenameWithCheckpoint } from "../plugins/local-llm-rename/local-llm-rename-with-checkpoint.js";
import { findProjectRoot } from "../file-utils.js";
import { existsSync, lstatSync, readFileSync } from "fs";
import { countIdentifiers } from "../plugins/local-llm-rename/visit-all-identifiers.js";
import { ReportManager } from "../report.js";

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
  .option("--disableGpu", "Disable GPU acceleration", false)
  .option("--gpu <backend>", "Force specific GPU backend (auto, cuda, vulkan, metal, cpu)", "auto")
  .option("--gpuLayers <n>", "Number of layers to offload to GPU", parseInt)
  .option("--flashAttention", "Enable Flash Attention", false)
  .option("--threads <n>", "Number of threads for CPU operations", parseInt)
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
  .option("-r, --recursive", "Recursively search for files in directories", false)
  .option("--maxids <number>", "Skip files that exceed this number of identifiers")
  .argument("<inputs...>", "The input minified Javascript file(s) or glob patterns")
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
      if (opts.recursive && existsSync(p) && lstatSync(p).isDirectory()) {
        return path.join(p, "**/*.js").replace(/\\/g, '/');
      }
      return p;
    });

    const files = await glob(normalizedInputs, { absolute: true });

    const finalRegistryPath = opts.registry || path.join(findProjectRoot(process.cwd()), ".humanify-registry.json");
    logRunSummary("Local LLM Rename", opts, finalRegistryPath);

    if (files.length === 0) {
      err("No files found matching the provided inputs.");
    }

    const contextWindowSize = parseInt(opts.contextSize);
    const prompt = await llama({
      seed: opts.seed ? parseInt(opts.seed) : undefined,
      model: opts.model,
      disableGpu: opts.disableGpu,
      gpu: opts.gpu,
      gpuLayers: opts.gpuLayers,
      flashAttention: opts.flashAttention,
      threads: opts.threads
    });

    let renamePlugin;
    if (opts.checkpoint) {
      const checkpointManager = new CheckpointManager(opts.outputDir);
      renamePlugin = localRenameWithCheckpoint(
        prompt,
        contextWindowSize,
        checkpointManager
      );
    } else {
      renamePlugin = localReanme(prompt, contextWindowSize);
    }

    // Store config for checkpoint-aware version
    (renamePlugin as any).__config = {
      prompt,
      contextWindowSize
    };

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

    if ((prompt as any).dispose) {
      await (prompt as any).dispose();
    }
  });
