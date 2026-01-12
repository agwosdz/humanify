import fs from "fs/promises";
import path from "path";
import { existsSync } from "fs";
import { ensureFileExists } from "./file-utils.js";
import { webcrack } from "./plugins/webcrack.js";
import { verbose } from "./verbose.js";

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
  skipExisting = false
) {
  ensureFileExists(filename);

  const inputBaseName = path.basename(filename, path.extname(filename));
  const expectedOutput = path.join(outputDir, `${inputBaseName}.deobfuscated.js`);

  if (skipExisting && existsSync(expectedOutput)) {
    console.log(`Skipping ${filename} because ${expectedOutput} already exists.`);
    return;
  }

  const bundledCode = await fs.readFile(filename, "utf-8");

  const workspaceDir = path.join(outputDir, ".humanify-work");
  await fs.rm(workspaceDir, { recursive: true, force: true });
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

    const formattedCode = await plugins.reduce(
      (p, next) => p.then(next),
      Promise.resolve(code)
    );

    verbose.log("Input: ", code);
    verbose.log("Output: ", formattedCode);

    const finalName = path.basename(file.path);
    const targetPath = path.join(outputDir, finalName);

    await backupFile(targetPath);
    await fs.writeFile(targetPath, formattedCode);
  }

  await fs.rm(workspaceDir, { recursive: true, force: true });

  console.log(`Done! You can find your unminified code in ${outputDir}`);
}
