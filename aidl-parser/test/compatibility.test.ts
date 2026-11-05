import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseAidl } from "../dist/index.js";
import {
  compatibilityCases,
  canonical,
} from "../../scripts/compatibility-cases.ts";

test("public results match source AST snapshots, including Unicode and invalid input", async () => {
  const expected = JSON.parse(
    await readFile(new URL("./compatibility.json", import.meta.url), "utf8"),
  ) as Record<string, string>;

  const cases = await compatibilityCases();
  assert.deepEqual(
    cases.map((item) => item.name).sort(),
    Object.keys(expected).sort(),
  );
  for (const { name, source } of cases) {
    const hash = createHash("sha256")
      .update(canonical(parseAidl(source)))
      .digest("hex");
    assert.equal(hash, expected[name], name);
  }
});
