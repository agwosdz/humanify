import { verbose } from "../../verbose.js";
import { gbnf } from "./gbnf.js";
import { Prompt } from "./llama.js";

export async function unminifyVariableName(
  prompt: Prompt,
  variableName: string,
  filename: string,
  code: string
) {
  verbose.log("Unminifying variable name:", variableName);
  verbose.log("Surrounding code:", code);

  const jsonResult = await prompt(
    `You are a Senior Code Deobfuscator. Your task is to analyze the identifier '${variableName}' in the file '${filename}'.`,
    `Analyze the role of '${variableName}' in the following code and suggest a high-quality name.
    
    CODE:
    ${code}`,
    gbnf`{
      "description": "${/[^\r\n\x0b\x0c\x85\u2028\u2029"]+/}",
      "suggestedName": "${/[a-zA-Z][a-zA-Z0-9]{2,15}/}"
    }`
  );

  const { description, suggestedName } = JSON.parse(jsonResult);
  verbose.log("Description:", description);
  verbose.log("Renaming to:", suggestedName);

  return suggestedName;
}
