import { RenameRegistry } from "./registry.js";

export function geminiRenameWithCheckpoint({
  apiKey,
  model: modelName,
  contextWindowSize,
  checkpointManager
}: {
  apiKey: string;
  model: string;
  contextWindowSize: number;
  checkpointManager?: CheckpointManager;
}) {
  const client = new GoogleGenerativeAI(apiKey);
  let registry: RenameRegistry | undefined;

  const startTime = Date.now();
  const plugin = async (code: string): Promise<string> => {
    return await visitAllIdentifiersWithCheckpoint(
      code,
      async (name, surroundingCode) => {
        verbose.log(`Renaming ${name}`);
        verbose.log("Context: ", surroundingCode);

        try {
          const model = client.getGenerativeModel({ model: modelName });
          const result = await model.generateContent(
            toRenamePrompt(name, surroundingCode)
          );
          const response = result.response.text();

          const renamed = parseSuggestions(response, name);
          return renamed;
        } catch (e) {
          verbose.log(`Gemini rename failed for ${name}:`, e);
          return name;
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
    const model = client.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    return result.response.text();
  };
  (plugin as any).contextWindowSize = contextWindowSize;
  Object.defineProperty(plugin, 'name', { value: 'geminiRename' });

  return plugin;
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