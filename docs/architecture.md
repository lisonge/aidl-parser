# Architecture

## Workspace

| Directory      | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `aidl-cpp`     | Pinned upstream sources, build-local adaptations, CMake/Ninja WASM build |
| `aidl-parser`  | TypeScript API, asset copying, npm distribution                          |
| `aidl-website` | React / CodeMirror playground and parser Worker                          |

`aidl-cpp/upstream/metadata.json` pins AIDL to `android-17.0.0_r1`, commit `9a94664f74536bf28010207fd1804b04c6435e2c`. `dependencies.json` pins libbase, fmtlib and nlohmann/json. Upstream checkouts are downloaded explicitly and are ignored by Git; regular builds are offline. The upstream synchronization command verifies existing checkout commits and does not discard local changes.

The build creates a local copy of upstream files and adds a `Parser::ParseSource` entry plus read-only accessors for locations and annotation parameters. The `source-spans.ts` adaptation patches the build-local `.ll` / `.yy` files to record byte spans and name spans, preserve parentheses and explicit package/import declarations, recognize CR line endings, accept empty documents and diagnose unterminated comments. The pinned upstream checkout stays untouched. The entry skips import resolution, type registration and union Tag generation. Diagnostics use a project-owned log implementation. Enum/field defaults synthesized by upstream constructors are omitted from output unless written in the source.

C++ compilation and final Emscripten linking both use `-O3`. The build-local adaptation corrects AOSP's `void` declarations of `yylex_init` and `yylex_destroy` to match Flex's `int` return types. The inconsistent cross-translation-unit signatures caused WASM validation to fail during optimization; no optimization pass is disabled. Generated `.mjs` stays generated JavaScript; the parser API and playground use TypeScript/TSX.

## Data flow

The C++ bridge streams a private, versioned JSON format using numeric kinds/directions/severities, short keys, absolute UTF-8 byte-offset pairs and omitted defaults. `scripts/generate-wire.ts` generates the shared numeric constants. Syntax spans are stored as two integer offsets, while original declaration names are retained only on defined types. The TypeScript decoder maps byte offsets into UTF-16 ranges using line starts and sparse corrections for multibyte characters; ASCII needs no offset map. Each public node is constructed directly with a stable field layout. Diagnostic anchors remain distinct from complete syntax spans. Website requests keep one running parse and the newest pending edit; collapsed tree children and the JSON view are rendered on demand.

The JSON writer emits unescaped ASCII directly and delegates escaping and UTF-8 handling to nlohmann/json. In the build-local syntax-only parser, compound expressions retain their children instead of reconstructing redundant text; literals and references keep their text. This avoids quadratic copying along binary-expression chains. Semantic evaluation and its value-text diagnostics are not part of `ParseSource`.

`syntax-performance.ts` removes semantic visitor-completeness recording during node destruction and skips constructing implicit field/parameter defaults in the build-local copy. Explicit initializers still produce expression nodes. Compilation and linking use `-fwasm-exceptions` so normal C++ calls avoid JavaScript exception-emulation bridges; the runtime must support native Wasm EH. Profiling builds retain function names with `--profiling-funcs`, independently of the production artifact.
