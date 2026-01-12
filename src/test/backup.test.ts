import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { unminify } from "../unminify.js";

const TEST_DIR = "test-backup-dir";
const INPUT_FILE = "test-input.js";

test.beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
    await fs.rm(INPUT_FILE, { force: true });
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.rm(INPUT_FILE, { force: true });
});

test("unminify implements .old backup logic", async () => {
    const code = "console.log('hello');";
    const expectedName = "test-input.deobfuscated.js";
    const targetPath = path.join(TEST_DIR, expectedName);
    const backupPath = `${targetPath}.old`;

    // Write initial input
    await fs.writeFile(INPUT_FILE, code);

    // First run: creates the initial file
    await unminify(INPUT_FILE, TEST_DIR);
    assert(existsSync(targetPath), "Initial file should exist");
    assert(!existsSync(backupPath), "Backup should not exist yet");

    const firstRunContent = await fs.readFile(targetPath, "utf-8");

    // Wait a bit to ensure timestamp change if needed, though here we care about content
    const newCode = "console.log('updated');";
    await fs.writeFile(INPUT_FILE, newCode);

    // Second run: should move first run to .old
    await unminify(INPUT_FILE, TEST_DIR);

    assert(existsSync(targetPath), "Target file should exist after second run");
    assert(existsSync(backupPath), "Backup file should exist after second run");

    const backupContent = await fs.readFile(backupPath, "utf-8");
    assert.strictEqual(backupContent, firstRunContent, "Backup should match first run content");

    const secondRunContent = await fs.readFile(targetPath, "utf-8");
    assert.notStrictEqual(secondRunContent, firstRunContent, "New file should contain updated code");

    // Third run: should update .old
    const thirdCode = "console.log('third');";
    await fs.writeFile(INPUT_FILE, thirdCode);
    await unminify(INPUT_FILE, TEST_DIR);

    const updatedBackupContent = await fs.readFile(backupPath, "utf-8");
    assert.strictEqual(updatedBackupContent, secondRunContent, "Backup should match second run content");
});
