import { labelIdentifiers } from "./label-plugin.js";
import { COMBINED_DISTILL_PROMPT } from "./prompts.js";
import { RenameRegistry } from "../../registry.js";

export async function distill(
    code: string,
    visitor: (name: string, context: string, prompt: string) => Promise<string>,
    contextWindowSize: number,
    registry?: RenameRegistry
): Promise<string> {
    console.log("Starting distillation pass: Role Identification & JSDoc Generation");

    // Combined Pass: Labeling + JSDoc
    const processedCode = await labelIdentifiers(
        code,
        (name, context) => visitor(name, context, COMBINED_DISTILL_PROMPT(name, context)),
        contextWindowSize
    );

    return processedCode;
}
