import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { unminify } from "../unminify.js";

const TEST_DIR = "test-skip-dir";
const INPUT_FILE = "test-skip-input.js";

test.beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.rm(INPUT_FILE, { force: true });
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(INPUT_FILE, { force: true });
});

test("unminify skips processing if output already exists", async () => {
    const code = "console.log('hello');";
    const expectedName = "test-skip-input.deobfuscated.js";
    const targetPath = path.join(TEST_DIR, expectedName);

    // Write initial input
    await fs.writeFile(INPUT_FILE, code);

    // First run: creates the initial file
    await unminify(INPUT_FILE, TEST_DIR);
    assert(existsSync(targetPath), "Initial file should exist");

    // Modify the file to something else to see if it gets overwritten
    await fs.writeFile(targetPath, "ALREADY_PROCESSED");

    // Second run with skipExisting = true
    // We pass a plugin that would change the content if it ran
    const plugin = async (_: string) => "NEW_CONTENT";
    await unminify(INPUT_FILE, TEST_DIR, [plugin], true);

    const content = await fs.readFile(targetPath, "utf-8");
    assert.strictEqual(content, "ALREADY_PROCESSED", "File should not have been re-processed");

    // Third run with skipExisting = false
    await unminify(INPUT_FILE, TEST_DIR, [plugin], false);
    const updatedContent = await fs.readFile(targetPath, "utf-8");
    assert.strictEqual(updatedContent, "NEW_CONTENT", "File should have been re-processed when skipExisting is false");
});
