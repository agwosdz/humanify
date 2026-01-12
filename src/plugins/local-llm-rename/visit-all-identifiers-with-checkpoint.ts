import { parseAsync, transformFromAstAsync, NodePath } from "@babel/core";
import * as babelTraverse from "@babel/traverse";
import { Identifier, toIdentifier, Node } from "@babel/types";
import { CheckpointManager } from "../../checkpoint.js";
import { verbose } from "../../verbose.js";
import { RenameRegistry } from "../../registry.js";

const traverse: typeof babelTraverse.default = (
  typeof babelTraverse.default === "function"
    ? babelTraverse.default
    : babelTraverse.default.default
);

type Visitor = (name: string, scope: string) => Promise<string>;

interface VisitOptions {
  checkpointManager?: CheckpointManager;
  saveInterval?: number; // Save checkpoint every N identifiers
  registry?: RenameRegistry;
}

export async function visitAllIdentifiersWithCheckpoint(
  code: string,
  visitor: Visitor,
  contextWindowSize: number,
  onProgress?: (percentageDone: number, current?: number, total?: number) => void,
  options?: VisitOptions
) {
  const { checkpointManager, saveInterval = 10 } = options || {};

  // Load checkpoint if exists
  let checkpoint = null;
  let processedIdentifiers = new Set<string>();
  let renamesMap = new Map<string, string>();
  let startIndex = 0;

  if (checkpointManager) {
    checkpoint = await checkpointManager.loadCheckpoint();
    if (checkpoint) {
      processedIdentifiers = checkpoint.processedIdentifiers;
      renamesMap = checkpoint.renames;
      startIndex = checkpoint.currentIdentifierIndex;
      verbose.log(`Resuming from checkpoint: ${startIndex} identifiers already processed`);
    }
  }

  const ast = await parseAsync(code, { sourceType: "unambiguous" });
  const renames = new Set<string>(renamesMap.values());
  const visited = new Set<string>(processedIdentifiers);

  if (!ast) {
    throw new Error("Failed to parse code");
  }

  const scopes = await findScopes(ast);
  const numRenamesExpected = scopes.length;

  // Apply existing renames from checkpoint
  if (checkpoint && renamesMap.size > 0) {
    for (const [originalName, newName] of renamesMap.entries()) {
      const scopePath = scopes.find(s => s.node.name === originalName);
      if (scopePath && scopePath.scope.hasBinding(originalName)) {
        scopePath.scope.rename(originalName, newName);
      }
    }
  }

  let processedCount = startIndex;

  // Don't save initial checkpoint - wait for first rename

  try {
    for (let i = startIndex; i < scopes.length; i++) {
      const smallestScope = scopes[i];

      if (hasVisited(smallestScope, visited)) continue;

      const smallestScopeNode = smallestScope.node;
      if (smallestScopeNode.type !== "Identifier") {
        throw new Error("No identifiers found");
      }

      const renamedFromRegistry = options?.registry?.getSuggestedName(smallestScopeNode.name);
      let renamed: string;

      if (renamedFromRegistry) {
        renamed = renamedFromRegistry;
      } else {
        const surroundingCode = await scopeToString(
          smallestScope,
          contextWindowSize
        );
        renamed = await visitor(smallestScopeNode.name, surroundingCode);
      }

      if (renamed !== smallestScopeNode.name) {
        let safeRenamed = toIdentifier(renamed);
        while (
          renames.has(safeRenamed) ||
          smallestScope.scope.hasBinding(safeRenamed) ||
          (options?.registry && options.registry.isNameUsed(safeRenamed) && !renamedFromRegistry)
        ) {
          safeRenamed = `_${safeRenamed}`;
        }
        renames.add(safeRenamed);
        renamesMap.set(smallestScopeNode.name, safeRenamed);

        if (!renamedFromRegistry && options?.registry) {
          options.registry.registerName(smallestScopeNode.name, safeRenamed);
        }

        smallestScope.scope.rename(smallestScopeNode.name, safeRenamed);

        // Save individual rename result immediately
        if (checkpointManager) {
          await checkpointManager.savePartialResults(`rename_${Date.now()}_${smallestScopeNode.name}`, {
            originalName: smallestScopeNode.name,
            newName: safeRenamed,
            timestamp: Date.now()
          });
        }
      }

      markVisited(smallestScope, smallestScopeNode.name, visited);
      processedIdentifiers.add(smallestScopeNode.name);
      processedCount++;

      onProgress?.(processedCount / numRenamesExpected, processedCount, numRenamesExpected);

      // Save checkpoint after every few identifiers (lightweight - no code)
      if (checkpointManager && processedCount % 5 === 0) {
        console.log(`Processed ${processedCount} identifiers, saving checkpoint...`);
        await checkpointManager.saveCheckpoint({
          processedIdentifiers,
          renames: renamesMap,
          currentFileIndex: 0,
          currentIdentifierIndex: processedCount,
          timestamp: Date.now()
        });
      }
    }
  } catch (error) {
    // Save checkpoint on error
    if (checkpointManager) {
      verbose.log("Error occurred, saving checkpoint...");
      await checkpointManager.saveCheckpoint({
        processedIdentifiers,
        renames: renamesMap,
        currentFileIndex: 0,
        currentIdentifierIndex: processedCount,
        timestamp: Date.now()
      });
    }
    throw error;
  }

  onProgress?.(1);

  const stringified = await transformFromAstAsync(ast);
  if (stringified?.code == null) {
    throw new Error("Failed to stringify code");
  }

  // Clear checkpoint on successful completion
  if (checkpointManager) {
    await checkpointManager.clearCheckpoint();
  }

  return stringified.code;
}

// Re-export original function for backward compatibility
export async function visitAllIdentifiers(
  code: string,
  visitor: Visitor,
  contextWindowSize: number,
  onProgress?: (percentageDone: number, current?: number, total?: number) => void
) {
  return visitAllIdentifiersWithCheckpoint(
    code,
    visitor,
    contextWindowSize,
    onProgress
  );
}

function findScopes(ast: Node): NodePath<Identifier>[] {
  const scopes: [nodePath: NodePath<Identifier>, scopeSize: number][] = [];
  traverse(ast, {
    BindingIdentifier(path) {
      const bindingBlock = closestSurroundingContextPath(path).scope.block;
      const pathSize = bindingBlock.end! - bindingBlock.start!;

      scopes.push([path, pathSize]);
    }
  });

  scopes.sort((a, b) => b[1] - a[1]);

  return scopes.map(([nodePath]) => nodePath);
}

function hasVisited(path: NodePath<Identifier>, visited: Set<string>) {
  return visited.has(path.node.name);
}

function markVisited(
  path: NodePath<Identifier>,
  newName: string,
  visited: Set<string>
) {
  visited.add(newName);
}

async function scopeToString(
  path: NodePath<Identifier>,
  contextWindowSize: number
) {
  const surroundingPath = closestSurroundingContextPath(path);
  const code = `${surroundingPath}`; // Implements a hidden `.toString()`
  if (code.length < contextWindowSize) {
    return code;
  }
  if (surroundingPath.isProgram()) {
    const start = path.node.start ?? 0;
    const end = path.node.end ?? code.length;
    if (end < contextWindowSize / 2) {
      return code.slice(0, contextWindowSize);
    }
    if (start > code.length - contextWindowSize / 2) {
      return code.slice(-contextWindowSize);
    }

    return code.slice(
      start - contextWindowSize / 2,
      end + contextWindowSize / 2
    );
  } else {
    return code.slice(0, contextWindowSize);
  }
}

function closestSurroundingContextPath(
  path: NodePath<Identifier>
): NodePath<Node> {
  const programOrBindingNode = path.findParent(
    (p) => p.isProgram() || path.node.name in p.getOuterBindingIdentifiers()
  )?.scope.path;
  return programOrBindingNode ?? path.scope.path;
}