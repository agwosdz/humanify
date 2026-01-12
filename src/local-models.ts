import fs from "fs/promises";
import { existsSync } from "fs";
import { basename } from "path";
import { url } from "./url.js";
import { err } from "./cli-error.js";
import { homedir } from "os";
import { join } from "path";
import { ChatWrapper, Llama3_1ChatWrapper } from "node-llama-cpp";
import { downloadFile } from "ipull";
import { verbose } from "./verbose.js";

const MODEL_DIRECTORY = join(homedir(), ".humanifyjs", "models");

type ModelDefinition = { url: URL; wrapper?: ChatWrapper };

export const MODELS: { [modelName: string]: ModelDefinition } = {
  "2b": {
    url: url`https://huggingface.co/bartowski/Phi-3.1-mini-4k-instruct-GGUF/resolve/main/Phi-3.1-mini-4k-instruct-Q4_K_M.gguf?download=true`
  },
  "8b": {
    url: url`https://huggingface.co/lmstudio-community/Meta-Llama-3.1-8B-Instruct-GGUF/resolve/main/Meta-Llama-3.1-8B-Instruct-Q4_K_M.gguf?download=true`,
    wrapper: new Llama3_1ChatWrapper()
  },
  "phi4-q4": {
    url: url`https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct-Q4_K_M.gguf?download=true`
  },
  "phi4-q8": {
    url: url`https://huggingface.co/unsloth/Phi-4-mini-instruct-GGUF/resolve/main/Phi-4-mini-instruct.Q8_0.gguf?download=true`
  },
  "phi3-q4": {
    url: url`https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-q4.gguf?download=true`
  },
  "phi3-fp16": {
    url: url`https://huggingface.co/microsoft/Phi-3-mini-4k-instruct-gguf/resolve/main/Phi-3-mini-4k-instruct-fp16.gguf?download=true`
  }
};

async function ensureModelDirectory() {
  await fs.mkdir(MODEL_DIRECTORY, { recursive: true });
}

export function getModelWrapper(model: string) {
  if (model in MODELS) {
    return MODELS[model].wrapper;
  }
  return undefined;
}

export async function downloadModel(model: string) {
  await ensureModelDirectory();
  const url = MODELS[model].url;
  if (url === undefined) {
    err(`Model ${model} not found`);
  }

  const path = getModelPath(model);

  if (existsSync(path)) {
    console.log(`Model "${model}" already downloaded`);
    return;
  }

  const tmpPath = `${path}.part`;

  const downlaoder = await downloadFile({
    url: url.toString(),
    savePath: tmpPath,
    cliProgress: true,
    cliStyle: verbose.enabled ? "ci" : "auto"
  });
  await downlaoder.download();

  await fs.rename(tmpPath, path);
  console.log(`Model "${model}" downloaded to ${path}`);
}

export const DEFAULT_MODEL = Object.keys(MODELS)[0];

export function getModelPath(model: string) {
  if (model in MODELS) {
    const filename = basename(MODELS[model].url.pathname);
    return `${MODEL_DIRECTORY}/${filename}`;
  }
  return model;
}

export function getEnsuredModelPath(model: string) {
  const path = getModelPath(model);
  if (!existsSync(path)) {
    err(
      `Model "${model}" not found. Run "humanify download ${model}" to download the model.`
    );
  }
  return path;
}
