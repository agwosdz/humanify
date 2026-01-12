import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";

const execAsync = promisify(exec);

export async function verify(
    originalFile: string,
    unminifiedFile: string
) {
    console.log("Starting functional verification...");

    try {
        // Run both in Node.js and capture output
        // Note: This only works for standalone scripts or scripts with side-effects that print to stdout
        const [originalResult, unminifiedResult] = await Promise.all([
            execAsync(`node ${originalFile}`).catch(e => e),
            execAsync(`node ${unminifiedFile}`).catch(e => e)
        ]);

        const originalOut = originalResult.stdout?.toString() || "";
        const unminifiedOut = unminifiedResult.stdout?.toString() || "";

        if (originalOut === unminifiedOut) {
            console.log("✅ Verification successful! Behavior matches.");
            return true;
        } else {
            console.warn("⚠️ Verification warning: Output mismatch.");
            console.log("Original Output:", originalOut);
            console.log("Unminified Output:", unminifiedOut);
            return false;
        }
    } catch (e) {
        console.error("❌ Verification failed:", e);
        return false;
    }
}
