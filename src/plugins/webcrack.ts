import { webcrack as wc } from "webcrack";
import fs from "fs/promises";
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
      await fs.rename(
        path.join(outputDir, "deobfuscated.js"),
        path.join(outputDir, newName)
      );
    }
  }

  const output = await fs.readdir(outputDir);
  return output
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ path: path.join(outputDir, file) }));
}
