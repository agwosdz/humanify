import test from "node:test";
import assert from "node:assert";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { webcrack } from "../plugins/webcrack.js";

const TEST_DIR = "test-backup-dir";

test.beforeEach(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
    await fs.mkdir(TEST_DIR, { recursive: true });
});

test.after(async () => {
    await fs.rm(TEST_DIR, { recursive: true, force: true });
});

test("webcrack implements .old backup logic", async () => {
    const code = "console.log('hello');";
    const originalFilename = "my-script.js";
    const expectedName = "my-script.deobfuscated.js";
    const targetPath = path.join(TEST_DIR, expectedName);
    const backupPath = `${targetPath}.old`;

    // First run: creates the initial file
    await webcrack(code, TEST_DIR, originalFilename);
    assert(existsSync(targetPath), "Initial file should exist");
    assert(!existsSync(backupPath), "Backup should not exist yet");

    const firstRunContent = await fs.readFile(targetPath, "utf-8");

    // Second run: should move first run to .old
    const newCode = "console.log('updated');";
    await webcrack(newCode, TEST_DIR, originalFilename);

    assert(existsSync(targetPath), "Target file should exist after second run");
    assert(existsSync(backupPath), "Backup file should exist after second run");

    const backupContent = await fs.readFile(backupPath, "utf-8");
    assert.strictEqual(backupContent, firstRunContent, "Backup should match first run content");

    const secondRunContent = await fs.readFile(targetPath, "utf-8");
    assert.notStrictEqual(secondRunContent, firstRunContent, "New file should contain updated code");

    // Third run: should update .old
    const thirdCode = "console.log('third');";
    await webcrack(thirdCode, TEST_DIR, originalFilename);

    const updatedBackupContent = await fs.readFile(backupPath, "utf-8");
    assert.strictEqual(updatedBackupContent, secondRunContent, "Backup should match second run content");
});
