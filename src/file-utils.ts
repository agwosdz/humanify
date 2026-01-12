import { existsSync } from "fs";
import fs from "fs/promises";
import { err } from "./cli-error.js";
import { verbose } from "./verbose.js";

export function ensureFileExists(filename: string) {
  if (!existsSync(filename)) {
    err(`File ${filename} not found`);
  }
}

export async function rmWithRetry(dirPath: string, retries = 5, delay = 500) {
  for (let i = 0; i < retries; i++) {
    try {
      await fs.rm(dirPath, { recursive: true, force: true });
      return;
    } catch (error: any) {
      if (error.code === "EBUSY" && i < retries - 1) {
        verbose.log(`Workspace busy, retrying cleanup (${i + 1}/${retries})...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      if (i === retries - 1) {
        console.warn(`Warning: Could not fully clean up workspace at ${dirPath}: ${error.message}`);
      } else {
        throw error;
      }
    }
  }
}

import path from "path";

export function findProjectRoot(startDir: string): string {
  let currentDir = path.resolve(startDir);
  while (currentDir !== path.parse(currentDir).root) {
    if (existsSync(path.join(currentDir, ".git")) || existsSync(path.join(currentDir, "package.json"))) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  return startDir;
}
