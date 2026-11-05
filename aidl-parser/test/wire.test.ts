import { test } from "node:test";
import assert from "node:assert/strict";
import createModule from "../dist/wasm/aidl.mjs";
import { allocate } from "../src/runtime.ts";
import type { WasmModule } from "../src/runtime.ts";
import { wire } from "../src/generated/wire.ts";

test("production WASM emits compact numeric protocol without profiling exports", async () => {
  const module: WasmModule = await createModule();
  assert.equal("_aidl_metric" in module, false);
  const input = allocate(
    module,
    "interface I { void f(int a, in int b, out int[] c, inout int[] d); }",
  );
  const filename = allocate(module, "input.aidl");
  const output = module._aidl_parse(input, filename);
  try {
    const text = module.UTF8ToString(output);
    const result = JSON.parse(text);
    assert.equal(result.version, wire.version);
    assert.equal(result.doc.k, wire.kinds.document);
    const method = result.doc.dc[0].m[0];
    assert.equal(method.k, wire.kinds.method);
    assert.deepEqual(
      method.ps.map((arg: { d: number }) => arg.d),
      [0, 1, 2, 3],
    );
    assert.equal("w" in method, false);
    assert.equal("i" in method, false);
    assert.equal("comments" in method, false);
    assert.equal(method.p.length, 4);
    assert.ok(Buffer.byteLength(text) < 600);
  } finally {
    module._aidl_free(output);
    module._free(input);
    module._free(filename);
  }
});
