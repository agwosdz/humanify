import { visitAllIdentifiers } from "./local-llm-rename/visit-all-identifiers.js";
import { verbose } from "../verbose.js";
import { showPercentage } from "../progress.js";
import {
  GoogleGenerativeAI,
  ModelParams,
  SchemaType
} from "@google/generative-ai";

import { RenameRegistry } from "./registry.js";

export function geminiRename({
  apiKey,
  model: modelName,
  contextWindowSize
}: {
  apiKey: string;
  model: string;
  contextWindowSize: number;
}) {
  const client = new GoogleGenerativeAI(apiKey);
  let registry: RenameRegistry | undefined;

  const startTime = Date.now();
  const plugin = async (code: string): Promise<string> => {
    return await visitAllIdentifiers(
      code,
      async (name, surroundingCode) => {
        verbose.log(`Renaming ${name}`);
        verbose.log("Context: ", surroundingCode);

        const model = client.getGenerativeModel({ model: modelName });
        const result = await model.generateContent(
          toRenamePrompt(name, surroundingCode)
        );
        const response = result.response.text();
        return parseSuggestions(response, name);
      },
      contextWindowSize,
      (p, c, t) => showPercentage(p, c, t, "Rename ", "green", startTime),
      registry
    );
  };

  (plugin as any).setRegistry = (r: RenameRegistry) => {
    registry = r;
  };

  (geminiRenamePlugin as any).getVisitor = () => async (name: string, context: string, prompt: string) => {
    const model = client.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  };
  (geminiRenamePlugin as any).contextWindowSize = contextWindowSize;

  // Set function name for identification
  Object.defineProperty(geminiRenamePlugin, 'name', { value: 'geminiRename' });

  return geminiRenamePlugin;
}

function toRenameParams(name: string, model: string): ModelParams {
  return {
    model,
    systemInstruction: `Rename Javascript variables/function \`${name}\` to have descriptive name based on their usage in the code."`,
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        nullable: false,
        description: "The new name for the variable/function",
        type: SchemaType.OBJECT,
        properties: {
          newName: {
            type: SchemaType.STRING,
            nullable: false,
            description: `The new name for the variable/function called \`${name}\``
          }
        },
        required: ["newName"]
      }
    }
  };
}
