import { webcrack as wc } from "webcrack";
import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

type File = {
  path: string;
};

export async function webcrack(
  code: string,
  outputDir: string,
  originalFilename?: string
): Promise<File[]> {
  const cracked = await wc(code);
  await fs.mkdir(outputDir, { recursive: true });
  await cracked.save(outputDir);

  if (originalFilename) {
    const sourcePath = path.join(outputDir, "deobfuscated.js");

    if (existsSync(sourcePath)) {
      const inputBaseName = path.basename(
        originalFilename,
        path.extname(originalFilename)
      );
      const newName = `${inputBaseName}.deobfuscated.js`;
      const targetPath = path.join(outputDir, newName);

      await fs.rename(sourcePath, targetPath);
    }
  }

  const output = await fs.readdir(outputDir);
  return output
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ path: path.join(outputDir, file) }));
}
