import { mkdir, readFile, readdir, writeFile, cp } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "./process.ts";
import { init, parse } from "es-module-lexer";
const root = fileURLToPath(new URL("../", import.meta.url));
const target = resolve(root, "build/package-test");
await mkdir(target, { recursive: true });
const pnpm =
  process.env.PNPM_EXECUTABLE ??
  (process.platform === "win32" ? "pnpm.exe" : "pnpm");
await run(pnpm, ["pack", "--out", resolve(target, "aidl-parser.tgz")], {
  cwd: resolve(root, "aidl-parser"),
});
await run("tar", ["-xf", resolve(target, "aidl-parser.tgz"), "-C", target]);
await mkdir(resolve(target, "node_modules/aidl-parser"), { recursive: true });
await cp(
  resolve(target, "package"),
  resolve(target, "node_modules/aidl-parser"),
  { recursive: true },
);
await writeFile(
  resolve(target, "package.json"),
  '{"private":true,"type":"module"}',
);
await writeFile(
  resolve(target, "check.ts"),
  `import assert from 'node:assert/strict';
import { parseAidl, sourceText } from 'aidl-parser';
import * as api from 'aidl-parser';
import type { AidlParseResult, NodeBase, Annotation, Diagnostic, SourceRange, Parameter } from 'aidl-parser';
const result: AidlParseResult = parseAidl('interface IPacked { void ping(); }');
assert.equal(result.document?.declarations[0]?.name, 'IPacked');
assert.equal(sourceText('interface IPacked { void ping(); }', result.document!.declarations[0]!), 'interface IPacked { void ping(); }');
assert.equal(result.document!.declarations[0]!.nameRange.start.offset, 10);
assert.deepEqual(result.diagnostics, []);
assert.deepEqual(Object.keys(api).sort(), ['parseAidl', 'sourceText', 'upstream']);
if (false) {
  const unspecifiedDirection: Parameter['direction'] = null;
  // @ts-expect-error Unspecified direction is null, not an empty string.
  const emptyDirection: Parameter['direction'] = '';
  const nodeLocation: SourceRange = ({} as NodeBase).range;
  const annotationLocation: SourceRange = ({} as Annotation).range;
  // @ts-expect-error Diagnostic anchors are no longer exposed as AST locations.
  const oldLocation = ({} as NodeBase).location;
  // @ts-expect-error Diagnostics may lack a source location.
  const diagnosticLocation: SourceRange = ({} as Diagnostic).range;
  // @ts-expect-error Only source text is accepted by the public API.
  parseAidl('', { filename: 'custom.aidl' });
}
console.log('Packed npm package: Node parse OK');
`,
);
await run(process.execPath, [resolve(target, "check.ts")]);
await run(process.execPath, [
  resolve(root, "node_modules/typescript/bin/tsc"),
  "--ignoreConfig",
  "--noEmit",
  "--strict",
  "--types",
  "node",
  "--skipLibCheck",
  "--target",
  "ESNext",
  "--module",
  "NodeNext",
  resolve(target, "check.ts"),
]);
const files = await readdir(resolve(target, "package/dist/wasm"));
await init;
const [moduleImports] = parse(
  await readFile(resolve(target, "package/dist/wasm/aidl.mjs"), "utf8"),
);
if (moduleImports.some(({ specifier }) => specifier === "node:module"))
  throw new Error("Packed WASM loader exposes node:module to browser bundlers");
for (const name of ["aidl.mjs", "aidl.wasm", "aidl.d.mts"])
  if (!files.includes(name)) throw new Error(`Missing package asset: ${name}`);
const metadata = JSON.parse(
  await readFile(resolve(target, "package/dist/upstream.json"), "utf8"),
);
if (metadata.tag !== "android-17.0.0_r1")
  throw new Error("Wrong upstream version");
