import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { humanify } from "../test-utils.js";

const TEST_DIR = "test-registry-dir";
const FILE_1 = "reg-test-1.min.js";
const FILE_2 = "reg-test-2.min.js";
const REGISTRY_FILE = path.join(TEST_DIR, ".humanify-registry.json");

test.beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    // Use a unique name that the AI will likely rename to the same thing
    await fs.writeFile(FILE_1, "function _0xabc123() { console.log('hello'); } _0xabc123();");
    await fs.writeFile(FILE_2, "function _0xabc123() { console.log('world'); } _0xabc123();");
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(FILE_1, { force: true });
    await fs.rm(FILE_2, { force: true });
});

test("registry persists and shares names across files", async () => {
    // Process first file
    const result1 = await humanify(
        "local",
        FILE_1,
        "--outputDir",
        TEST_DIR,
        "--seed", "1"
    );

    assert.strictEqual(result1.exitCode, 0, `First run failed: ${result1.stderr}`);
    assert(existsSync(REGISTRY_FILE), "Registry file should be created");

    const registryData = JSON.parse(await fs.readFile(REGISTRY_FILE, "utf-8"));
    const entry = registryData.mappings.find(([orig]: [string]) => orig === "_0xabc123");
    assert(entry, "Registry should contain mapping for _0xabc123");
    const preservedName = entry[1];

    // Process second file
    const result2 = await humanify(
        "local",
        FILE_2,
        "--outputDir",
        TEST_DIR,
        "--seed", "1"
    );

    assert.strictEqual(result2.exitCode, 0, `Second run failed: ${result2.stderr}`);

    const output2 = path.join(TEST_DIR, "reg-test-2.min.deobfuscated.js");
    const content2 = await fs.readFile(output2, "utf-8");

    // Check if the name from the first run was reused in the second run
    assert(content2.includes(preservedName), `Second file should use the same name '${preservedName}' from registry`);
});
