import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import { verbose } from "./verbose.js";

const execAsync = promisify(exec);

export async function verify(
    originalFile: string,
    unminifiedFile: string
) {
    console.log(`\n🔍 Functional Verification: Comparing outputs...`);
    verbose.log(`Original: ${originalFile}`);
    verbose.log(`Unminified: ${unminifiedFile}`);

    try {
        const start = Date.now();
        const [originalResult, unminifiedResult] = await Promise.all([
            execAsync(`node "${originalFile}"`).catch(e => e),
            execAsync(`node "${unminifiedFile}"`).catch(e => e)
        ]);
        const duration = Date.now() - start;

        const originalOut = originalResult.stdout?.toString() || "";
        const originalErr = originalResult.stderr?.toString() || "";
        const unminifiedOut = unminifiedResult.stdout?.toString() || "";
        const unminifiedErr = unminifiedResult.stderr?.toString() || "";

        const match = originalOut === unminifiedOut;

        // Always show comparison if there's a mismatch or if verbose is enabled
        if (!match || verbose.enabled) {
            console.log("\n[Original Stdout]");
            console.log(originalOut || "(no output)");
            if (originalErr) {
                console.log("\n[Original Stderr]");
                console.log(originalErr);
            }

            console.log("\n[Unminified Stdout]");
            console.log(unminifiedOut || "(no output)");
            if (unminifiedErr) {
                console.log("\n[Unminified Stderr]");
                console.log(unminifiedErr);
            }
            console.log("------------------------------------------");
        }

        if (match) {
            console.log(`✅ Verification successful! Behavior matches (${duration}ms).`);
            return true;
        } else {
            console.warn(`⚠️ Verification warning: Output mismatch (${duration}ms).`);
            return false;
        }
    } catch (e) {
        console.error("❌ Verification execution error:", e);
        return false;
    }
}
