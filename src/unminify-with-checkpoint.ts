import fs from "fs/promises";
import path from "path";
import { ensureFileExists } from "./file-utils.js";
import { webcrack } from "./plugins/webcrack.js";
import { verbose } from "./verbose.js";
import { existsSync } from "fs";
import { CheckpointManager } from "./checkpoint.js";

interface UnminifyOptions {
  enableCheckpoint?: boolean;
  resumeFromCheckpoint?: boolean;
}

export async function unminifyWithCheckpoint(
  filename: string,
  outputDir: string,
  plugins: ((code: string) => Promise<string>)[] = [],
  options: UnminifyOptions = {}
) {
  const { enableCheckpoint = true, resumeFromCheckpoint = false } = options;

  ensureFileExists(filename);

  const checkpointManager = enableCheckpoint
    ? new CheckpointManager(outputDir)
    : undefined;

  // Check if we should resume from checkpoint
  if (resumeFromCheckpoint && checkpointManager) {
    const hasCheckpoint = await checkpointManager.hasCheckpoint();
    if (hasCheckpoint) {
      console.log("Found existing checkpoint. Resuming from where we left off...");
      const checkpoint = await checkpointManager.loadCheckpoint();
      if (checkpoint) {
        console.log(`Resuming from file ${checkpoint.currentFileIndex + 1}`);
      }
    } else {
      console.log("No checkpoint found. Starting from the beginning...");
    }
  }

  const bundledCode = await fs.readFile(filename, "utf-8");

  const workspaceDir = path.join(outputDir, ".humanify-work");
  // Only recreate workspace if we are not resuming, or if it doesn't exist
  if (!resumeFromCheckpoint || !existsSync(workspaceDir)) {
    await fs.rm(workspaceDir, { recursive: true, force: true });
    await fs.mkdir(workspaceDir, { recursive: true });
  }

  const extractedFiles = await webcrack(bundledCode, workspaceDir, filename);

  // Load checkpoint to determine where to start
  let startIndex = 0;
  if (checkpointManager && resumeFromCheckpoint) {
    const checkpoint = await checkpointManager.loadCheckpoint();
    if (checkpoint) {
      startIndex = checkpoint.currentFileIndex;
    }
  }

  for (let i = startIndex; i < extractedFiles.length; i++) {
    console.log(`Processing file ${i + 1}/${extractedFiles.length}`);

    const file = extractedFiles[i];
    let code = await fs.readFile(file.path, "utf-8");

    if (code.trim().length === 0) {
      verbose.log(`Skipping empty file ${file.path}`);
      continue;
    }

    try {
      // Create plugin chain with checkpoint support
      const pluginsWithCheckpoint = plugins.map((plugin, pluginIndex) => {
        return async (currentCode: string) => {
          try {
            // If this is a rename plugin and checkpoint is enabled
            if (checkpointManager && (plugin as any).__config) {
              const pluginConfig = (plugin as any).__config;
              console.log("Plugin name:", (plugin as any).name, "Config:", !!pluginConfig);

              // OpenAI plugin
              if ((plugin as any).name === 'openaiRename') {
                console.log("Using OpenAI rename with checkpoint");
                const { openaiRenameWithCheckpoint } = await import("./plugins/openai/openai-rename-with-checkpoint.js");
                const checkpointAwarePlugin = openaiRenameWithCheckpoint({
                  ...pluginConfig,
                  checkpointManager
                });
                return await checkpointAwarePlugin(currentCode);
              }

              // Gemini plugin
              if ((plugin as any).name === 'geminiRename') {
                const { geminiRenameWithCheckpoint } = await import("./plugins/gemini-rename-with-checkpoint.js");
                const checkpointAwarePlugin = geminiRenameWithCheckpoint({
                  ...pluginConfig,
                  checkpointManager
                });
                return await checkpointAwarePlugin(currentCode);
              }

              // Local plugin
              if ((plugin as any).name === 'localReanme' || (plugin as any).name === 'localRename') {
                const { localRenameWithCheckpoint } = await import("./plugins/local-llm-rename/local-llm-rename-with-checkpoint.js");
                const checkpointAwarePlugin = localRenameWithCheckpoint(
                  pluginConfig.prompt,
                  pluginConfig.contextWindowSize,
                  checkpointManager
                );
                return await checkpointAwarePlugin(currentCode);
              }
            }

            return await plugin(currentCode);
          } catch (error) {
            // Save checkpoint on plugin error
            if (checkpointManager) {
              await checkpointManager.saveCheckpoint({
                processedIdentifiers: new Set(),
                renames: new Map(),
                currentFileIndex: i,
                currentIdentifierIndex: 0,
                timestamp: Date.now()
              });
            }
            throw error;
          }
        };
      });

      const formattedCode = await pluginsWithCheckpoint.reduce(
        (p, next) => p.then(next),
        Promise.resolve(code)
      );

      verbose.log("Input: ", code);
      verbose.log("Output: ", formattedCode);

      const finalName = path.basename(file.path);
      const targetPath = path.join(outputDir, finalName);

      // We use existsSync from 'fs' which is already imported in some versions, 
      // but let's make sure it works. I'll add the backup logic here.
      if (existsSync(targetPath)) {
        const backupPath = `${targetPath}.old`;
        await fs.rm(backupPath, { force: true });
        await fs.rename(targetPath, backupPath);
      }

      await fs.writeFile(targetPath, formattedCode);

      // Save checkpoint after each file
      if (checkpointManager) {
        await checkpointManager.saveCheckpoint({
          processedIdentifiers: new Set(),
          renames: new Map(),
          currentFileIndex: i + 1,
          currentIdentifierIndex: 0,
          timestamp: Date.now()
        });
      }
    } catch (error) {
      console.error(`Error processing file ${file.path}:`, error);
      console.log("You can resume from this point by using the --resume flag");
      throw error;
    }
  }

  await fs.rm(workspaceDir, { recursive: true, force: true });

  // Clear checkpoint on successful completion
  if (checkpointManager) {
    await checkpointManager.clearCheckpoint();
  }

  console.log(`Done! You can find your unminified code in ${outputDir}`);

  // Merge partial results if available
  if (checkpointManager) {
    const mergedRenames = await checkpointManager.mergePartialResults();
    if (mergedRenames.size > 0) {
      const outputFile = path.join(outputDir, "rename-mappings.json");
      await fs.writeFile(
        outputFile,
        JSON.stringify(Array.from(mergedRenames.entries()), null, 2)
      );
      console.log(`Rename mappings saved to ${outputFile}`);
    }
  }
}