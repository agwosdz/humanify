import { showPercentage } from "../../progress.js";
import { defineFilename } from "./define-filename.js";
import { Prompt } from "./llama.js";
import { unminifyVariableName } from "./unminify-variable-name.js";
import { visitAllIdentifiers } from "./visit-all-identifiers.js";

const PADDING_CHARS = 200;

export const localReanme = (prompt: Prompt, contextWindowSize: number) => {
  let registry: RenameRegistry | undefined;

  const localRenamePlugin = async (code: string): Promise<string> => {
    const filename = await defineFilename(
      prompt,
      code.slice(0, PADDING_CHARS * 2)
    );

    return await visitAllIdentifiers(
      code,
      (name, surroundingCode) =>
        unminifyVariableName(prompt, name, filename, surroundingCode),
      contextWindowSize,
      showPercentage,
      registry
    );
  };

  (localRenamePlugin as any).setRegistry = (r: RenameRegistry) => {
    registry = r;
  };

  (localRenamePlugin as any).getVisitor = () => (name: string, context: string, promptText: string) => {
    return prompt(promptText, "{}", { parseResult: (r) => r });
  };
  (localRenamePlugin as any).contextWindowSize = contextWindowSize;

  // Set function name for identification
  Object.defineProperty(localRenamePlugin, 'name', { value: 'localRename' });

  return localRenamePlugin;
};
