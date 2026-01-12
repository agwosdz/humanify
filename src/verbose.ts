export const verbose = {
  log(...args: ConsoleLogArgs) {
    if (this.enabled) {
      const timestamp = new Date()
        .toISOString()
        .replace(/T/, " ")
        .replace(/\..+/, "");
      console.log(`[${timestamp}] `, ...args);
    }
  },
  enabled: process.env["CI"] === "true"
};

export function logRunSummary(title: string, options: Record<string, any>, registryPath: string) {
  console.log(`\n=== ${title} ===`);
  console.log(`Registry: ${registryPath}`);
  const interestingOpts = Object.entries(options)
    .filter(([_, v]) => v !== undefined && v !== false && v !== "" && typeof v !== 'object')
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
  if (interestingOpts) {
    console.log(`Options: ${interestingOpts}`);
  }
  console.log("=".repeat(title.length + 8));
}

type ConsoleLogArgs = Parameters<typeof console.log>;
