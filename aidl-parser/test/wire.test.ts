import { test } from "node:test";
import assert from "node:assert/strict";
import createModule from "../dist/wasm/aidl.mjs";
import { allocate } from "../src/runtime.ts";
import type { WasmModule } from "../src/runtime.ts";
import { wire } from "../src/generated/wire.ts";
import { readFile } from "node:fs/promises";

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
    assert.equal(method.p.length, 2);
    assert.ok(Buffer.byteLength(text) < 1000);
  } finally {
    module._aidl_free(output);
    module._free(input);
    module._free(filename);
  }
});

test("native memory plateaus across batches of successful and failed parses", async () => {
  const bytes = await readFile(
    new URL("../dist/wasm/aidl.wasm", import.meta.url),
  );
  const compiled = await WebAssembly.compile(bytes);
  let memory: WebAssembly.Memory | undefined;
  const options = {
    wasmBinary: bytes,
    instantiateWasm(
      imports: WebAssembly.Imports,
      receive: (instance: WebAssembly.Instance) => void,
    ) {
      const instance = new WebAssembly.Instance(compiled, imports);
      memory = Object.values(instance.exports).find(
        (value): value is WebAssembly.Memory =>
          value instanceof WebAssembly.Memory,
      );
      receive(instance);
      return instance.exports;
    },
  };
  const module: WasmModule = await createModule(options);
  assert.ok(memory);
  const filename = allocate(module, "memory.aidl");
  const valid = allocate(
    module,
    "interface I {" +
      Array.from(
        { length: 100 },
        (_, i) => `const int X${i} = ((1 + 2)) * 3;`,
      ).join("") +
      "}",
  );
  const invalid = allocate(module, "interface I { const int X = ((1 + ; }");
  const batch = () => {
    for (let i = 0; i < 1000; i++) {
      const output = module._aidl_parse(i % 2 ? valid : invalid, filename);
      module._aidl_free(output);
    }
    const probe = module._malloc(1024);
    module._free(probe);
    return { capacity: memory!.buffer.byteLength, probe };
  };
  try {
    const warmed = batch();
    assert.deepEqual(batch(), warmed);
    assert.deepEqual(batch(), warmed);
  } finally {
    module._free(valid);
    module._free(invalid);
    module._free(filename);
  }
});
