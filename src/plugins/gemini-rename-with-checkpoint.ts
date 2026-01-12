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

  const plugin = async (code: string): Promise<string> => {
    return await visitAllIdentifiersWithCheckpoint(
      code,
      async (name, surroundingCode) => {
        verbose.log(`Renaming ${name}`);
        verbose.log("Context: ", surroundingCode);

        try {
          const model = client.getGenerativeModel(
            toRenameParams(name, modelName)
          );

          const result = await model.generateContent(surroundingCode);

          const renamed = JSON.parse(result.response.text()).newName;

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
      showPercentage,
      { checkpointManager, saveInterval: 5, registry } // Save every 5 identifiers
    );
  };

  (plugin as any).setRegistry = (r: RenameRegistry) => {
    registry = r;
  };

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