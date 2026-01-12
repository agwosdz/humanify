import { webcrack as wc } from "webcrack";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

type File = {
  path: string;
};

async function backupFile(filePath: string) {
  if (existsSync(filePath)) {
    const backupPath = `${filePath}.old`;
    await fs.rm(backupPath, { force: true });
    await fs.rename(filePath, backupPath);
  }
}

export async function webcrack(
  code: string,
  outputDir: string,
  originalFilename?: string
): Promise<File[]> {
  const cracked = await wc(code);
  await fs.mkdir(outputDir, { recursive: true });
  await cracked.save(outputDir);

  if (originalFilename) {
    const outputFiles = await fs.readdir(outputDir);
    const jsFiles = outputFiles.filter((file) => file.endsWith(".js"));

    if (jsFiles.length === 1 && jsFiles[0] === "deobfuscated.js") {
      const inputBaseName = path.basename(
        originalFilename,
        path.extname(originalFilename)
      );
      const newName = `${inputBaseName}.deobfuscated.js`;
      const targetPath = path.join(outputDir, newName);
      const sourcePath = path.join(outputDir, "deobfuscated.js");

      await backupFile(targetPath);
      await fs.rename(sourcePath, targetPath);
    }
  }

  const output = await fs.readdir(outputDir);
  return output
    .filter((file) => file.endsWith(".js") && !file.endsWith(".old"))
    .map((file) => ({ path: path.join(outputDir, file) }));
}
