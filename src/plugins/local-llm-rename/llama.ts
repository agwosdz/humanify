import {
  getLlama,
  LlamaChatSession,
  LlamaGrammar,
  LlamaModelOptions
} from "node-llama-cpp";
import { Gbnf } from "./gbnf.js";
import { getModelPath, getModelWrapper } from "../../local-models.js";
import { verbose } from "../../verbose.js";

export type Prompt = (
  systemPrompt: string,
  userPrompt: string,
  responseGrammar: Gbnf
) => Promise<string>;

const IS_CI = process.env["CI"] === "true";

export async function llama(opts: {
  seed?: number;
  model: string;
  disableGpu?: boolean;
  gpu?: "auto" | "cuda" | "vulkan" | "metal" | "cpu";
  flashAttention?: boolean;
  gpuLayers?: number;
  threads?: number;
}): Promise<Prompt> {
  const disableGpu = opts.disableGpu ?? IS_CI;
  const gpuBackend = opts.gpu === "cpu" ? false : (opts.gpu ?? (disableGpu ? false : "auto"));

  const llama = await getLlama({ gpu: gpuBackend as any });

  const modelOpts: LlamaModelOptions = {
    modelPath: getModelPath(opts?.model),
    gpuLayers: opts.gpuLayers ?? (disableGpu ? 0 : undefined),
    defaultContextOptions: {
      flashAttention: opts.flashAttention,
      threads: opts.threads
    }
  };

  verbose.log("Loading model with options", modelOpts);
  const model = await llama.loadModel(modelOpts);

  interface LocalLlamaContextOptions {
    seed?: number;
    flashAttention?: boolean;
    threads?: number;
  }
  const contextOpts: LocalLlamaContextOptions = {
    flashAttention: opts.flashAttention,
    threads: opts.threads
  };
  if (opts?.seed !== undefined) {
    contextOpts.seed = opts.seed;
  }
  const context = await model.createContext(contextOpts as any);

  const promptFn: Prompt = async (systemPrompt, userPrompt, responseGrammar) => {
    const session = new LlamaChatSession({
      contextSequence: context.getSequence(),
      autoDisposeSequence: false, // We manage sequence disposal via context
      systemPrompt,
      chatWrapper: getModelWrapper(opts.model)
    });
    const response = await session.promptWithMeta(userPrompt, {
      temperature: 0.8,
      grammar: new LlamaGrammar(llama, {
        grammar: `${responseGrammar}`
      }),
      stopOnAbortSignal: true
    });
    session.dispose();
    return responseGrammar.parseResult(response.responseText);
  };

  (promptFn as any).dispose = async () => {
    await context.dispose();
  };

  return promptFn;
}
