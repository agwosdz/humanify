export const COMBINED_DISTILL_PROMPT = (name: string, code: string) => `
Analyze the role and types of the variable/function \`${name}\` in the following code.
Return a JSON object with:
1. "role": A short 1-3 word label (e.g., "api_client", "counter").
2. "jsdoc": A brief JSDoc comment (including @param/@return if it's a function).

CODE:
${code}
`;
