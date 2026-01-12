import assert from "assert";
import { spawn } from "child_process";
import { verbose } from "./verbose.js";

export function assertMatches(actual: string, expected: string[]) {
  assert(
    expected.some((str) => actual.toLowerCase().includes(str.toLowerCase())),
    `Expected ${actual} to be one of ${JSON.stringify(expected)}`
  );
}

export async function humanify(...argv: string[]) {
  const extraArgs = argv.includes("local") ? ["--seed", "1"] : [];
  const process = spawn("node", ["./dist/index.mjs", ...argv, ...extraArgs], { shell: true });
  const stdout: string[] = [];
  const stderr: string[] = [];
  process.stdout.on("data", (data) => stdout.push(data.toString()));
  process.stderr.on("data", (data) => stderr.push(data.toString()));

  const exitCode = await new Promise<number | null>((resolve) =>
    process.on("close", (code) => {
      resolve(code);
    })
  );

  verbose.log("stdout", stdout.join(""));
  verbose.log("stderr", stderr.join(""));

  return {
    stdout: stdout.join(""),
    stderr: stderr.join(""),
    exitCode
  };
}

export function ensure<T>(
  value: NonNullable<T> | undefined | null,
  message: string = "Value was null or undeined"
): NonNullable<T> {
  if (value === undefined || value === null) {
    throw new Error(message);
  }
  return value;
}
