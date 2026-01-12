import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ensureFileExists, rmWithRetry } from "./file-utils.js";
import { webcrack } from "./plugins/webcrack.js";
import { verbose } from "./verbose.js";
import { RenameRegistry } from "./registry.js";

async function backupFile(filePath: string) {
  if (existsSync(filePath)) {
    const backupPath = `${filePath}.old`;
    await fs.rm(backupPath, { force: true });
    await fs.rename(filePath, backupPath);
  }
}

export async function unminify(
  filename: string,
  outputDir: string,
  plugins: ((code: string) => Promise<string>)[] = [],
  skipExisting = false,
  enableDistill = false,
  enableVerify = false,
  registryPath?: string
) {
  ensureFileExists(filename);

  const inputBaseName = path.basename(filename, path.extname(filename));
  const expectedOutput = path.join(outputDir, `${inputBaseName}.deobfuscated.js`);

  if (skipExisting && existsSync(expectedOutput)) {
    console.log(`Skipping ${filename} because ${expectedOutput} already exists.`);
    return;
  }

  const registry = new RenameRegistry(outputDir, registryPath);
  await registry.load();

  const bundledCode = await fs.readFile(filename, "utf-8");

  const workspaceDir = path.join(outputDir, `.humanify-work-${inputBaseName}`);
  await rmWithRetry(workspaceDir);
  await fs.mkdir(workspaceDir, { recursive: true });

  const extractedFiles = await webcrack(bundledCode, workspaceDir, filename);

  for (let i = 0; i < extractedFiles.length; i++) {
    console.log(`Processing file ${i + 1}/${extractedFiles.length}`);

    const file = extractedFiles[i];
    const code = await fs.readFile(file.path, "utf-8");

    if (code.trim().length === 0) {
      verbose.log(`Skipping empty file ${file.path}`);
      continue;
    }

    let processedCode = code;
    if (enableDistill) {
      // Find the rename plugin to extract the visitor (visitor is internal to the plugin function unfortunately)
      // Actually, I should probably pass a distillVisitor specifically.
      // For now, I'll assume we use the first rename plugin's config if available.
      const renamePlugin = plugins.find(p => (p as any).name === 'localRename' || (p as any).name === 'geminiRename' || (p as any).name === 'openaiRename');
      if (renamePlugin && (renamePlugin as any).getVisitor) {
        const { distill } = await import("./plugins/distill/distill.js");
        processedCode = await distill(
          code,
          (renamePlugin as any).getVisitor(),
          (renamePlugin as any).contextWindowSize || 800,
          registry
        );
      }
    }

    const formattedCode = await plugins.reduce(
      (p, next) => p.then(code => {
        if ((next as any).setRegistry) {
          (next as any).setRegistry(registry);
        }
        return next(code);
      }),
      Promise.resolve(processedCode)
    );

    verbose.log("Input: ", code);
    verbose.log("Output: ", formattedCode);

    const finalName = path.basename(file.path);
    const targetPath = path.join(outputDir, finalName);

    await backupFile(targetPath);
    await fs.writeFile(targetPath, formattedCode);

    if (enableVerify) {
      const { verify } = await import("./verify.js");
      await verify(file.path, targetPath);
    }
  }

  await rmWithRetry(workspaceDir);
  await registry.save();

  console.log(`Done! You can find your unminified code in ${outputDir}`);
}
