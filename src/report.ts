import { writeFile } from "fs/promises";
import path from "path";

export interface ReportEntry {
    filename: string;
    status: "success" | "skipped" | "failed";
    reason?: string;
    identifierCount?: number;
}

export class ReportManager {
    private entries: ReportEntry[] = [];

    addEntry(entry: ReportEntry) {
        this.entries.push(entry);
    }

    getEntries() {
        return this.entries;
    }

    async saveReport(outputDir: string) {
        const reportPath = path.join(outputDir, "humanify-report.json");
        const reportData = {
            timestamp: new Date().toISOString(),
            summary: {
                total: this.entries.length,
                success: this.entries.filter(e => e.status === "success").length,
                skipped: this.entries.filter(e => e.status === "skipped").length,
                failed: this.entries.filter(e => e.status === "failed").length,
            },
            details: this.entries
        };

        await writeFile(reportPath, JSON.stringify(reportData, null, 2), "utf-8");
        console.log(`\nFinal report saved to: ${reportPath}`);
    }
}
