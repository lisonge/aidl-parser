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

The package exports `AidlDocument`, `Declaration`, `Member`, `Expression`, `Diagnostic`, `AidlParseResult`, `SourceRange`, and other TypeScript types, plus `upstream` with the pinned tag and commit. Only ESM is published; C++ tooling is unnecessary for consumers.

`parseAidl(source)` returns `AidlParseResult`. Parameter `direction` is `null | 'in' | 'out' | 'inout'`: `null` means the source omitted the direction, distinct from an explicit `in`. This replaces the former `ParseResult` type name and empty-string direction value.

AST nodes and annotations carry full `range` spans. Named declarations, members,
parameters, enumerators, package/import declarations and expression references
also carry `nameRange`. Diagnostics have an independent nullable `range`.
Offsets and columns count UTF-16 code units; lines/columns start at one and ends
are exclusive. LF, CRLF and CR each count as one newline; a tab counts as one
column. Declaration spans include annotations, modifiers and terminating syntax,
but exclude surrounding whitespace/comments. Document spans cover the entire
input, including empty input. Qualified name spans include any internal comments.

`sourceText(source, node)` returns the exact slice of the source used for parsing.
Expressions are a discriminated union of `literal` (`token`), `reference`
(`name`, `nameRange`), `parenthesized` (`expression`), `unary` (`operator`,
`operand`), `binary` (`operator`, `left`, `right`) and `array` (`elements`). Every
explicit pair of parentheses is preserved. Literal tokens retain radix, suffixes,
quotes and escapes; large integers are never converted to JavaScript numbers.
There is no shared `literal` field. Java-specific conversions such as `u8` belong
to consumers, which can replace literal spans in descending offset order.

`document.packageDeclaration` is a source declaration or `null`; it never
contains an inferred package. `document.imports` contains declaration nodes in
source order. Both kinds have `name`, `nameRange`, `range` and `comments`.
`parcelable outer.Value;` retains the declaration name `outer.Value` and has no
package declaration. Implicit enum values remain `null`.

```ts
import { parseAidl, sourceText } from "aidl-parser";
const source = "interface I { const int VALUE = (1 /* kept */ + 2) * 3; }";
const member = parseAidl(source).document!.declarations[0]!.members[0]!;
if (member.kind === "constant") {
  console.log(member.nameRange.start.line);
  console.log(sourceText(source, member.value));
}
```

Workers register their handler before importing the parser:

```ts
self.onmessage = async ({ data }) => {
  try {
    const { parseAidl } = await import("aidl-parser");
    self.postMessage({ id: data.id, result: parseAidl(data.source) });
  } catch (error) {
    self.postMessage({
      id: data.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};
```

Concurrent imports during initialization await the same module evaluation.
Import/initialization failures reject the promise; re-importing is not promised
to retry failed initialization. Syntax errors instead return diagnostics. Vite
production builds must target ESM with top-level await and serve the emitted WASM
asset, including the assets emitted for module Workers.

Source baseline: `android-17.0.0_r1`, commit `9a94664f74536bf28010207fd1804b04c6435e2c`. Third-party notices are under `dist/licenses/`.

## Scope

Supports structured extraction of interfaces, methods, parameters, parcelables (including forward declarations), enums, unions, nested declarations, imports, comments, annotations, generic types, arrays and constant-expression trees. References remain unresolved. Expressions are not evaluated. Parsing returns no document when errors occur; full error recovery and incremental parsing are not provided.

The official parser's lexical/AST-construction restrictions remain, including
known annotation names and rejection of raw non-ASCII string literals. Escaped
string tokens accepted by the lexer are preserved. Chinese/emoji comments are
supported. Native numeric token validation remains; expression evaluation and
Java conversion are not part of parsing.
