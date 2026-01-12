import fs from "fs/promises";
import { existsSync } from "fs";
import path from "path";

export class RenameRegistry {
    private mappings: Map<string, string> = new Map();
    private usedNames: Set<string> = new Set();
    private registryPath: string;

    constructor(outputDir: string) {
        this.registryPath = path.join(outputDir, ".humanify-registry.json");
    }

    async load() {
        if (existsSync(this.registryPath)) {
            try {
                const data = await fs.readFile(this.registryPath, "utf-8");
                const json = JSON.parse(data);

                // Merge mappings
                if (json.mappings) {
                    for (const [original, suggested] of json.mappings) {
                        this.mappings.set(original, suggested);
                    }
                }

                // Merge used names
                if (json.usedNames) {
                    for (const name of json.usedNames) {
                        this.usedNames.add(name);
                    }
                }
            } catch (e) {
                console.warn(`Warning: Failed to load registry from ${this.registryPath}:`, e);
            }
        }
    }

    async save() {
        try {
            const json = {
                mappings: Array.from(this.mappings.entries()),
                usedNames: Array.from(this.usedNames)
            };
            await fs.writeFile(this.registryPath, JSON.stringify(json, null, 2));
        } catch (e) {
            console.warn(`Warning: Failed to save registry to ${this.registryPath}:`, e);
        }
    }

    getSuggestedName(originalName: string): string | undefined {
        return this.mappings.get(originalName);
    }

    registerName(originalName: string, suggestedName: string) {
        this.mappings.set(originalName, suggestedName);
        this.usedNames.add(suggestedName);
    }

    isNameUsed(name: string): boolean {
        return this.usedNames.has(name);
    }

    /**
     * Generates a unique name by appending a suffix if the name is already used.
     */
    getUniqueName(baseName: string): string {
        let name = baseName;
        let counter = 1;
        while (this.usedNames.has(name)) {
            name = `${baseName}_${counter++}`;
        }
        return name;
    }
}
