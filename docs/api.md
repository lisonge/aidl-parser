# API and scope

Parse Android 17 AIDL into typed structural data using the official AOSP grammar and WebAssembly.

```ts
import { parseAidl } from "aidl-parser";

const result = parseAidl("interface IService { String getName(int id); }");
console.log(result.document, result.diagnostics);
```

The ESM module initializes one shared WASM instance with top-level `await`. Once the import completes, `parseAidl(source)` returns synchronously. Repeated imports in the same module environment reuse the instance; each Worker has its own instance. Type-only imports do not initialize WASM.

The static `new URL('./wasm/aidl.wasm', import.meta.url)` locates the packaged asset. Vite automatically emits and rewrites this URL; no `?url` import or manual WASM configuration is needed. Node.js loads the file URL locally. Consumers need ESM/top-level-await support.

Returned objects do not retain native AST allocations. Each call frees its input/output buffers and native AST. Invalid syntax returns `{ document: null, diagnostics }`; runtime failures throw. Module initialization errors reject the import. The API accepts only source text, with no factory, filename or loading-options argument. It does not read imports or access AIDL source files.

The package exports `AidlDocument`, `Declaration`, `Member`, `Expression`, `Diagnostic`, `AidlParseResult`, `SourceLocation`, and other TypeScript types, plus `upstream` with the pinned tag and commit. Only ESM is published; C++ tooling is unnecessary for consumers.

`parseAidl(source)` returns `AidlParseResult`. Parameter `direction` is `null | 'in' | 'out' | 'inout'`: `null` means the source omitted the direction, distinct from an explicit `in`. This replaces the former `ParseResult` type name and empty-string direction value.

AST nodes and annotations always have a `SourceLocation`; diagnostic locations remain nullable for messages without a source position. Locations are UTF-16 diagnostic anchors from AOSP, not complete node spans. Lines/columns start at one and ends are exclusive. Expression `literal` is upstream-normalized spelling. No semantic resolution, type checking, expression evaluation, code generation or incremental parsing is performed. Upstream parsing-time restrictions remain in effect.

Source baseline: `android-17.0.0_r1`, commit `9a94664f74536bf28010207fd1804b04c6435e2c`. Third-party notices are under `dist/licenses/`.

## Scope

Supports structured extraction of interfaces, methods, parameters, parcelables (including forward declarations), enums, unions, nested declarations, imports, comments, annotations, generic types, arrays and constant-expression trees. References remain unresolved. Expressions are not evaluated. Parsing returns no document when errors occur; full error recovery and incremental parsing are not provided.

Locations are the official parser's diagnostic anchors, **not full declaration/expression spans**. Offsets are converted to UTF-16; lines and columns are one-based and ends are exclusive. `literal` is the upstream expression spelling, not an exact source slice. The official parser's lexical/AST-construction restrictions remain, including known annotation names and rejection of raw non-ASCII string literals. Chinese/emoji comments are supported and tested.
