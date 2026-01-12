import { showPercentage } from "../../progress.js";
import { defineFilename } from "./define-filename.js";
import { Prompt } from "./llama.js";
import { unminifyVariableName } from "./unminify-variable-name.js";
import { visitAllIdentifiersWithCheckpoint } from "./visit-all-identifiers-with-checkpoint.js";
import { RenameRegistry } from "../../registry.js";
import { CheckpointManager } from "../../checkpoint.js";
import { verbose } from "../../verbose.js";
import { gbnf } from "./gbnf.js";

const PADDING_CHARS = 200;

export function localRenameWithCheckpoint(
  prompt: Prompt,
  contextWindowSize: number,
  checkpointManager?: CheckpointManager
) {
  let registry: RenameRegistry | undefined;

  const plugin = async (code: string): Promise<string> => {
    const startTime = Date.now();
    const filename = await defineFilename(
      prompt,
      code.slice(0, PADDING_CHARS * 2)
    );

    return await visitAllIdentifiersWithCheckpoint(
      code,
      async (name, surroundingCode) => {
        try {
          return await unminifyVariableName(prompt, name, filename, surroundingCode);
        } catch (error) {
          // On error, save checkpoint handled by visitAllIdentifiersWithCheckpoint
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

  (plugin as any).getVisitor = () => (name: string, context: string, promptText: string) => {
    return prompt(promptText, "{}", gbnf`${/./}`);
  };
  (plugin as any).contextWindowSize = contextWindowSize;
  Object.defineProperty(plugin, 'name', { value: 'localRename' });

  return plugin;
}