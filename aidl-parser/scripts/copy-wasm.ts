import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { init, parse } from "es-module-lexer";
const out = new URL("../dist/wasm/", import.meta.url);
export async function copyWasm() {
  await mkdir(out, { recursive: true });
  for (const file of ["aidl.mjs", "aidl.wasm"])
    await cp(
      new URL(`../../aidl-cpp/build/wasm/${file}`, import.meta.url),
      new URL(file, out),
    );
  const moduleFile = new URL("aidl.mjs", out);
  let source = await readFile(moduleFile, "utf8");
  await init;
  const [imports] = parse(source);
  // Keep the Node-only import out of browser bundlers' dependency resolution.
  for (const { start: s, end: e, type } of imports
    .filter(({ specifier }) => specifier === "node:module")
    .reverse()) {
    if (type !== "dynamic")
      throw new Error("Expected a dynamic node:module import");
    source = `${source.slice(0, s)}/* @vite-ignore */ globalThis && ${source.slice(s, e)}${source.slice(e)}`;
  }
  if (parse(source)[0].some(({ specifier }) => specifier === "node:module"))
    throw new Error("Bundler-visible node:module import remains");
  await writeFile(moduleFile, source);
  await writeFile(
    new URL("aidl.d.mts", out),
    `interface WasmModule {
  _malloc(size: number): number;
  _free(pointer: number): void;
  _aidl_parse(source: number, filename: number): number;
  _aidl_free(pointer: number): void;
  lengthBytesUTF8(value: string): number;
  stringToUTF8(value: string, pointer: number, length: number): void;
  UTF8ToString(pointer: number): string;
}
declare function createModule(options?: { wasmBinary?: Uint8Array; locateFile?: (path: string, prefix: string) => string }): Promise<WasmModule>;
export default createModule;
`,
  );
  const notices = new URL("../dist/licenses/", import.meta.url);
  await mkdir(notices, { recursive: true });
  for (const [from, to] of [
    ["aidl/NOTICE", "AOSP-AIDL.txt"],
    ["libbase/NOTICE", "AOSP-libbase.txt"],
    ["fmtlib/LICENSE", "fmt.txt"],
    ["json/LICENSE.MIT", "json.txt"],
  ]) {
    await cp(
      new URL(`../../aidl-cpp/upstream/${from}`, import.meta.url),
      new URL(to!, notices),
    );
  }
  await cp(
    new URL("../../aidl-cpp/upstream/metadata.json", import.meta.url),
    new URL("../dist/upstream.json", import.meta.url),
  );
}
