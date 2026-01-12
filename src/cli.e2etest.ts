import assert from "node:assert";
import test from "node:test";
import { humanify } from "./test-utils.js";

for (const cmd of ["openai", "local"]) {
  test(`${cmd} throws error on missing file`, async () => {
    const { exitCode } = await humanify(cmd, "nonexistent-file.js");
    assert.notStrictEqual(exitCode, 0);
  });
}

test("local throws error on missing model", async () => {
  const { exitCode } = await humanify("local", "--model", "nonexistent-model");
  assert.notStrictEqual(exitCode, 0);
});
