import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { humanify } from "../test-utils.js";

const TEST_DIR = "test-wildcard-dir";
const FIXTURE_1 = "test-1.min.js";
const FIXTURE_2 = "test-2.min.js";

test.beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.writeFile(FIXTURE_1, "console.log('one');");
    await fs.writeFile(FIXTURE_2, "console.log('two');");
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(FIXTURE_1, { force: true });
    await fs.rm(FIXTURE_2, { force: true });
});

test("cli supports glob patterns and multiple files", async () => {
    // Run humanify local with a glob
    const { exitCode, stderr, stdout } = await humanify(
        "local",
        "test-*.min.js",
        "--outputDir",
        TEST_DIR
    );

    assert.strictEqual(exitCode, 0, `Command failed with stderr: ${stderr}`);

    const output1 = path.join(TEST_DIR, "test-1.min.deobfuscated.js");
    const output2 = path.join(TEST_DIR, "test-2.min.deobfuscated.js");

    assert(existsSync(output1), "First file should be processed");
    assert(existsSync(output2), "Second file should be processed");

    const content1 = await fs.readFile(output1, "utf-8");
    const content2 = await fs.readFile(output2, "utf-8");

    assert(content1.includes("one"), "First output content check");
    assert(content2.includes("two"), "Second output content check");
});

test("cli supports Windows-style backslashes", async () => {
    // Run humanify local with a backslashed path
    const { exitCode, stderr } = await humanify(
        "local",
        ".\\test-1.min.js",
        "--outputDir",
        TEST_DIR
    );

    assert.strictEqual(exitCode, 0, `Command failed with stderr: ${stderr}`);
    const output = path.join(TEST_DIR, "test-1.min.deobfuscated.js");
    assert(existsSync(output), "File with backslashes should be processed");
});
