import { Readable } from "stream";
import { verbose } from "./verbose.js";

export function showProgress(stream: Readable) {
  let bytes = 0;
  let i = 0;
  stream.on("data", (data) => {
    bytes += data.length;
    if (i++ % 1000 !== 0) return;
    process.stdout.clearLine?.(0);
    process.stdout.write(`\rDownloaded ${formatBytes(bytes)}`);
  });
}

function formatBytes(numBytes: number) {
  const units = ["B", "KB", "MB", "GB", "TB"];
  let unitIndex = 0;
  while (numBytes > 1024 && unitIndex < units.length) {
    numBytes /= 1024;
    unitIndex++;
  }
  return `${numBytes.toFixed(2)} ${units[unitIndex]}`;
}

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  dim: "\x1b[2m"
};

export function showPercentage(
  percentage: number,
  current?: number,
  total?: number,
  label: string = "Processing",
  color: keyof typeof COLORS = "green",
  startTime?: number,
  unit: string = "ids"
) {
  const percentageInt = Math.round(percentage * 100);
  const width = 25;
  const filled = Math.round(percentage * width);
  const empty = width - filled;

  const barColor = COLORS[color];
  const bar = `${barColor}${"█".repeat(filled)}${COLORS.dim}${"░".repeat(Math.max(0, empty))}${COLORS.reset}`;

  let etaStr = "";
  if (startTime && current && total && current > 0) {
    const elapsed = Date.now() - startTime;
    const msPerId = elapsed / current;
    const eta = msPerId * (total - current);
    const secPerId = (msPerId / 1000).toFixed(2);
    etaStr = ` | ETA: ${formatDuration(eta)} (${secPerId}s/${unit.replace(/s$/, '')})`;
  }

  let progressText: string;
  if (current !== undefined && total !== undefined) {
    progressText = `${label}: [${bar}] ${percentageInt}% (${current}/${total} ${unit})${etaStr}`;
  } else {
    progressText = `${label}: [${bar}] ${percentageInt}%${etaStr}`;
  }

  if (!verbose.enabled) {
    if (process.stdout.clearLine && process.stdout.cursorTo) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write(progressText);
    } else {
      process.stdout.write(`\r${COLORS.reset}${progressText}\x1b[K`);
    }
  } else {
    verbose.log(progressText);
  }

  if ((current !== undefined && total !== undefined && current === total) || percentage === 1) {
    process.stdout.write("\n");
  }
}

function formatDuration(ms: number) {
  if (ms < 0) return "0s";
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}
