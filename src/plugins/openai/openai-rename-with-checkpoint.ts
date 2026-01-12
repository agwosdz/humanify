import OpenAI from "openai";
import { visitAllIdentifiersWithCheckpoint } from "../local-llm-rename/visit-all-identifiers-with-checkpoint.js";
import { showPercentage } from "../../progress.js";
import { verbose } from "../../verbose.js";
import { CheckpointManager } from "../../checkpoint.js";

export function openaiRenameWithCheckpoint({
  apiKey,
  baseURL,
  model,
  contextWindowSize,
  checkpointManager
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowSize: number;
  checkpointManager?: CheckpointManager;
}) {
  const client = new OpenAI({ apiKey, baseURL });
  let registry: RenameRegistry | undefined;

  const plugin = async (code: string): Promise<string> => {
    const startTime = Date.now();
    console.log("OpenAI rename with checkpoint started, checkpointManager:", !!checkpointManager);
    return await visitAllIdentifiersWithCheckpoint(
      code,
      async (name, surroundingCode) => {
        verbose.log(`Renaming ${name}`);
        verbose.log("Context: ", surroundingCode);

        try {
          const response = await client.chat.completions.create(
            toRenamePrompt(name, surroundingCode, model)
          );
          const result = response.choices[0].message?.content;
          if (!result) {
            throw new Error("Failed to rename", { cause: response });
          }
          const renamed = JSON.parse(result).newName;

          verbose.log(`Renamed to ${renamed}`);

          return renamed;
        } catch (error) {
          // On API error, save checkpoint
          if (checkpointManager) {
            verbose.log("API error occurred, checkpoint will be saved");
          }
          throw error;
        }
      },
      contextWindowSize,
      (p, c, t) => showPercentage(p, c, t, "Rename ", "green", startTime),
      { checkpointManager, registry }
    );
  };

  (plugin as any).setRegistry = (r: RenameRegistry) => {
    registry = r;
  };

  (plugin as any).getVisitor = () => async (name: string, context: string, prompt: string) => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0].message?.content || "";
  };
  (plugin as any).contextWindowSize = contextWindowSize;
  Object.defineProperty(plugin, 'name', { value: 'openaiRename' });

  return plugin;
}

function toRenamePrompt(
  name: string,
  surroundingCode: string,
  model: string
): OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming {
  return {
    model,
    messages: [
      {
        role: "system",
        content: `Rename Javascript variables/function \`${name}\` to have descriptive name based on their usage in the code."`
      },
      {
        role: "user",
        content: surroundingCode
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        strict: true,
        name: "rename",
        schema: {
          type: "object",
          properties: {
            newName: {
              type: "string",
              description: `The new name for the variable/function called \`${name}\``
            }
          },
          required: ["newName"],
          additionalProperties: false
        }
      }
    }
  };
}