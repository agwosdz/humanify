import OpenAI from "openai";
import { visitAllIdentifiers } from "../local-llm-rename/visit-all-identifiers.js";
import { showPercentage } from "../../progress.js";
import { verbose } from "../../verbose.js";

import { RenameRegistry } from "../../registry.js";

export function openaiRename({
  apiKey,
  baseURL,
  model,
  contextWindowSize
}: {
  apiKey: string;
  baseURL: string;
  model: string;
  contextWindowSize: number;
}) {
  const client = new OpenAI({ apiKey, baseURL });
  let registry: RenameRegistry | undefined;

  const openaiRenamePlugin = async (code: string): Promise<string> => {
    const startTime = Date.now();
    return await visitAllIdentifiers(
      code,
      async (name, surroundingCode) => {
        verbose.log(`Renaming ${name} `);
        verbose.log("Context: ", surroundingCode);

        const response = await client.chat.completions.create(
          toRenamePrompt(name, surroundingCode, model)
        );
        const result = response.choices[0].message?.content;
        if (!result) {
          throw new Error("Failed to rename", { cause: response });
        }
        const renamed = JSON.parse(result).newName;

        verbose.log(`Renamed to ${renamed} `);

        return renamed;
      },
      contextWindowSize,
      (p, c, t) => showPercentage(p, c, t, "Rename ", "green", startTime),
      registry
    );
  };

  (openaiRenamePlugin as any).setRegistry = (r: RenameRegistry) => {
    registry = r;
  };

  (openaiRenamePlugin as any).getVisitor = () => async (name: string, context: string, prompt: string) => {
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: "user", content: prompt }]
    });
    return response.choices[0].message?.content || "";
  };
  (openaiRenamePlugin as any).contextWindowSize = contextWindowSize;

  // Set function name for identification
  Object.defineProperty(openaiRenamePlugin, 'name', { value: 'openaiRename' });

  return openaiRenamePlugin;
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
        content: `Rename Javascript variables / function \`${name}\` to have descriptive name based on their usage in the code."`
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
