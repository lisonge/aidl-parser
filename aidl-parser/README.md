# aidl-parser

Parse Android 17 AIDL into typed structural data using the official AOSP grammar and WebAssembly. Works in Node.js and browsers.

```ts
import { parseAidl } from "aidl-parser";

const result = parseAidl("interface IService { String getName(int id); }");
console.log(result.document, result.diagnostics);
```

Nodes expose full UTF-16 `range` spans and named declarations expose `nameRange`.
Use `sourceText(source, node)` to recover exact source text. Expressions preserve
explicit parentheses and literal `token` spelling. Package/import declarations
are explicit AST nodes.

The package uses ESM. Import initializes WebAssembly, then `parseAidl` runs synchronously.
The runtime must support native WebAssembly exception handling (Wasm EH).

In Workers, register the message handler before calling `await import("aidl-parser")`
inside it. Concurrent imports share initialization; import failures reject and
are not automatically retried.

- [Online playground](https://aidl-parser.pages.dev/)
- [API documentation](https://github.com/lisonge/aidl-parser/blob/main/docs/api.md)
- [Project documentation](https://github.com/lisonge/aidl-parser#documentation)

Licensed under Apache-2.0. Third-party notices are included in `dist/licenses/`.
