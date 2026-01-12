import { parseAsync, transformFromAstAsync, NodePath } from "@babel/core";
import * as babelTraverse from "@babel/traverse";
import { Identifier, Node, addComment } from "@babel/types";
import { showPercentage } from "../../progress.js";
import { verbose } from "../../verbose.js";

const traverse: typeof babelTraverse.default = (
    typeof babelTraverse.default === "function"
        ? babelTraverse.default
        : babelTraverse.default.default
);

type RoleVisitor = (name: string, scope: string) => Promise<string>;

export async function labelIdentifiers(
    code: string,
    visitor: RoleVisitor,
    contextWindowSize: number
) {
    const ast = await parseAsync(code, { sourceType: "unambiguous" });
    if (!ast) throw new Error("Failed to parse code");

    const scopes = findScopes(ast);
    const total = scopes.length;

    for (let i = 0; i < total; i++) {
        const path = scopes[i];
        const name = path.node.name;
        const surroundingCode = await scopeToString(path, contextWindowSize);

        const result = await visitor(name, surroundingCode);
        try {
            const { role, jsdoc } = JSON.parse(result);
            if (role && role !== "unknown") {
                addComment(path.node, "leading", `humanify-role: ${role}`, true);
            }
            if (jsdoc) {
                addComment(path.node, "leading", jsdoc, true);
            }
        } catch (e) {
            verbose.log(`Failed to parse distillation result for ${name}: ${result}`);
        }

        showPercentage(i / total, i, total);
    }

    const result = await transformFromAstAsync(ast);
    return result?.code ?? code;
}

// ... helper functions similar to visit-all-identifiers ...
function findScopes(ast: Node): NodePath<Identifier>[] {
    const scopes: NodePath<Identifier>[] = [];
    traverse(ast, {
        BindingIdentifier(path) {
            scopes.push(path);
        }
    });
    return scopes;
}

async function scopeToString(path: NodePath<Identifier>, contextWindowSize: number) {
    const surroundingPath = path.findParent(p => p.isFunction() || p.isProgram());
    const code = `${surroundingPath}`;
    if (code.length < contextWindowSize) return code;

    const start = path.node.start ?? 0;
    const end = path.node.end ?? code.length;
    return code.slice(
        Math.max(0, start - contextWindowSize / 2),
        Math.min(code.length, end + contextWindowSize / 2)
    );
}
