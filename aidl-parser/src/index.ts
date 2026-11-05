import createModule from "../dist/wasm/aidl.mjs";
import { allocate } from "./runtime.ts";
import { decode } from "./decode.ts";
import type { WireResult } from "./decode.ts";
import type { WasmModule } from "./runtime.ts";
import type { AidlParseResult } from "./types.ts";
export type * from "./types.ts";
export const upstream = {
  tag: "android-17.0.0_r1",
  commit: "9a94664f74536bf28010207fd1804b04c6435e2c",
} as const;

// Relative to the published dist/index.js; Vite rewrites this static asset URL.
const wasmUrl = new URL("./wasm/aidl.wasm", import.meta.url);
const module: WasmModule = await createModule({
  locateFile: () => wasmUrl.href,
});

/** Parse AIDL synchronously using the module's shared WASM instance. */
export function parseAidl(source: string): AidlParseResult {
  if (source.includes("\0"))
    throw new TypeError("Source must not contain NUL characters");
  const input = allocate(module, source);
  const path = allocate(module, "input.aidl");
  let output = 0;
  try {
    output = module._aidl_parse(input, path);
    return decode(
      JSON.parse(module.UTF8ToString(output)) as WireResult,
      source,
    );
  } finally {
    if (output) module._aidl_free(output);
    module._free(path);
    module._free(input);
  }
}
