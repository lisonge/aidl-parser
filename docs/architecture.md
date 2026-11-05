# Architecture

## Workspace

| Directory      | Purpose                                                                  |
| -------------- | ------------------------------------------------------------------------ |
| `aidl-cpp`     | Pinned upstream sources, build-local adaptations, CMake/Ninja WASM build |
| `aidl-parser`  | TypeScript API, asset copying, npm distribution                          |
| `aidl-website` | React / CodeMirror playground and parser Worker                          |

`aidl-cpp/upstream/metadata.json` pins AIDL to `android-17.0.0_r1`, commit `9a94664f74536bf28010207fd1804b04c6435e2c`. `dependencies.json` pins libbase, fmtlib and nlohmann/json. Upstream checkouts are downloaded explicitly and are ignored by Git; regular builds are offline. The upstream synchronization command verifies existing checkout commits and does not discard local changes.

The build creates a local copy of upstream files and adds a `Parser::ParseSource` entry plus read-only accessors for locations and annotation parameters. It does not change the official `.ll` / `.yy` grammar. The entry skips import resolution, type registration and union Tag generation. Diagnostics use a project-owned log implementation. Enum/field defaults synthesized by upstream constructors are omitted from output unless written in the source.

C++ compilation and final Emscripten linking both use `-O3`. The build-local adaptation corrects AOSP's `void` declarations of `yylex_init` and `yylex_destroy` to match Flex's `int` return types. The inconsistent cross-translation-unit signatures caused WASM validation to fail during optimization; no optimization pass is disabled. Generated `.mjs` stays generated JavaScript; all handwritten JavaScript-side source, tests and scripts are TypeScript/TSX.

## Data flow

The C++ bridge streams a private, versioned JSON format using numeric kinds/directions/severities, short keys, location tuples and omitted defaults. `scripts/generate-wire.ts` generates the shared numeric constants. The TypeScript decoder restores the existing public API in one pass; ASCII positions use direct offsets and non-ASCII byte maps are created only for referenced lines. Website requests keep one running parse and the newest pending edit; collapsed tree children and the JSON view are rendered on demand.
