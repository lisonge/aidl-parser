import { test } from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { parseAidl } from "../dist/index.js";

test("official Android 17 AIDL fixtures parse without resolving imports", async () => {
  const root = new URL(
    "../../aidl-cpp/upstream/aidl/tests/android/aidl/tests/",
    import.meta.url,
  );
  const files = (await readdir(root, { recursive: true }))
    .filter((file) => file.endsWith(".aidl"))
    .sort();
  assert.ok(files.length > 50);

  const failures: string[] = [];
  for (const file of files) {
    const result = parseAidl(
      await readFile(new URL(file.replaceAll("\\", "/"), root), "utf8"),
    );
    if (!result.document || result.diagnostics.length)
      failures.push(`${file}: ${JSON.stringify(result.diagnostics)}`);
  }
  assert.deepEqual(failures, []);
  console.log(`Parsed ${files.length} upstream fixtures`);
});
