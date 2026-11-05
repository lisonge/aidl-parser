# aidl-parser

Parse Android 17 AIDL into typed structural data using the official AOSP grammar and WebAssembly. Works in Node.js and browsers.

```ts
import { parseAidl } from "aidl-parser";

const result = parseAidl("interface IService { String getName(int id); }");
console.log(result.document, result.diagnostics);
```

The package uses ESM. Import initializes WebAssembly, then `parseAidl` runs synchronously.

- [Online playground](https://aidl-parser.pages.dev/)
- [API documentation](https://github.com/lisonge/aidl-parser/blob/main/docs/api.md)
- [Project documentation](https://github.com/lisonge/aidl-parser#documentation)

Licensed under Apache-2.0. Third-party notices are included in `dist/licenses/`.
