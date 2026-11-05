import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { parseAidl } from "../dist/index.js";
import {
  compatibilityCases,
  canonical,
} from "../../scripts/compatibility-cases.ts";

// Preserve the original golden hashes; adapt only the intentional direction API change.
function legacyDirections(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(legacyDirections);
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record).map(([key, child]) => [
      key,
      record.kind === "parameter" && key === "direction" && child === null
        ? ""
        : legacyDirections(child),
    ]),
  );
}

test("public results match pre-optimization snapshots, including Unicode and invalid input", async () => {
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
      .update(canonical(legacyDirections(parseAidl(source))))
      .digest("hex");
    assert.equal(hash, expected[name], name);
  }
});
