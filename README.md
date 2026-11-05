# aidl-parser

Parse Android 17 AIDL into typed structural data using the official AOSP grammar and WebAssembly. Works in Node.js and browsers.

Try it online: [AIDL Structure Lab](https://aidl-parser.pages.dev/).

## Usage

```ts
import { parseAidl } from "aidl-parser";

const result = parseAidl("interface IService { String getName(int id); }");
console.log(result.document, result.diagnostics);
```

The ESM import initializes WebAssembly; subsequent parsing calls are synchronous. Results include declarations, members, types, annotations, source locations and syntax diagnostics. The parser does not resolve imports, check types or generate code.

## Documentation

- [API and scope](docs/api.md)
- [Local development and build commands](docs/development.md)
- [Architecture](docs/architecture.md)
- [Performance and profiling](docs/performance.md)
- [Website deployment](docs/deployment.md)

Licensed under Apache-2.0. The npm package includes third-party notices in `dist/licenses/`.
