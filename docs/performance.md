# Native parser hotspot optimization — 2026-11-05

The baseline already includes the string serialization and compound-text changes
below. This round removes visitor-completeness recording, switches from JS-emulated
C++ exceptions to native Wasm EH, and omits implicit field/parameter default nodes.
Public AST and wire protocol remain unchanged. Upstream checkouts remain untouched;
syntax changes are applied to build-local copies by `syntax-performance.ts`.

## Combined paired result

Windows, Intel Core i9-14900HX, Node 26.12.1; 30 warmups and 60 samples per variant.
Public parse order alternates in the same process. WASM initialization is excluded;
each input is checked for deep AST equality. Stage measurements are separate and
sequential across variants, so stage medians cannot be added or treated as paired
stage speedup estimates when host load changes.

| Input                               | Before p50 | After p50 | Reduction | Before p95 | After p95 |
| ----------------------------------- | ---------: | --------: | --------: | ---------: | --------: |
| Official `ITestService.aidl`        |    1.56 ms |   1.12 ms |     27.7% |    2.04 ms |   1.49 ms |
| 1,000 methods                       |    8.27 ms |   5.43 ms |     34.4% |    9.83 ms |   6.51 ms |
| 5,000 methods                       |   42.81 ms |  26.63 ms |     37.8% |   54.12 ms |  35.94 ms |
| 1,000 short constant expressions    |    8.67 ms |   6.06 ms |     30.1% |   10.25 ms |   7.42 ms |
| 1,000 methods with Unicode comments |    7.00 ms |   4.69 ms |     32.9% |    7.54 ms |   5.66 ms |
| 20 chains, 500 operands each        |   16.90 ms |  12.11 ms |     28.4% |   21.41 ms |  14.83 ms |
| 20 arrays, 500 elements each        |    9.88 ms |   6.41 ms |     35.1% |   11.10 ms |   7.54 ms |

These are warm parser timings, not whole-repository indexing measurements. All
listed cases improved in p50 and p95 in this final paired run. Host timing varied
substantially during the investigation, so do not compare absolute numbers across
reports or treat these percentages as guarantees on other machines.

## What the samples showed, and what changed

1. **Visitor tracking:** `AidlNode` destructors previously appended locations for
   nodes not marked by a semantic visitor, then the bridge cleared the list.
   `ParseSource` does not run the visitor-completeness check. The build-local
   destructor now performs no recording and the visited flag is removed. Empty
   compatibility methods remain for unexecuted semantic compiler code. Isolated
   measurements were mixed: 5,000 methods improved 3.2%, but chains regressed 7.0%
   and arrays 5.5%. This cleanup is not claimed as a stable latency win.
2. **Exception dispatch:** Node CPU sampling of native calls identified repeated
   JS exception-emulation bridges during normal execution. After tracking removal,
   `wasm-to-js` self samples were 1,012 / 6,764 (15.0%); after native EH they were
   3 / 3,429 (0.09%). These are sample shares, not exact wall-time percentages;
   inclusive counts overlap. Both compilation and linking now use
   `-fwasm-exceptions`, preserving C++ exceptions while avoiding the JS bridges.
   The isolated 1,000-method public p50 changed 6.32 → 4.28 ms (32.4%). Later cases
   in that same report experienced a large host slowdown; the combined table above
   is the final measurement, not a comparison against those absolute latencies.
3. **Implicit defaults:** `AidlConstantValue::Default` accounted for 402 / 6,764
   inclusive native samples before EH and 151 / 3,429 after EH. Parameter and field
   constructors created code-generation defaults that the source AST never emits.
   Their implicit constructor now passes null; explicit initializers are unchanged.
   The function disappears from final samples. Isolated 5,000-method p50 improved
   31.05 → 30.16 ms (2.9%), while p95 changed 38.43 → 39.70 ms. This small result
   is not enough to claim a stable independent latency improvement.

Native EH is the main measured improvement. The build behavior follows
[Emscripten's native exception documentation](https://emscripten.org/docs/porting/exceptions.html).

## Remaining costs

The final native-only sampling run (4,316 samples) shows lexer self samples at
18.4%, grammar-action self samples at 16.4%, and the inclusive parser implementation
at 57.6% of the entire native call (which also serializes and frees the AST).
`wasm-to-js` self samples are now 1 / 4,316. These percentages are overlapping where
inclusive counts are used; inlining also affects attribution.

Final instrumented stage medians for 5,000 methods: C++ parse 8.39 ms, wire writer
5.05 ms, cleanup 0.56 ms, output copy 0.09 ms, UTF-8 decode 1.66 ms, JSON.parse
8.82 ms, public-AST conversion 6.33 ms. Stage medians are not additive and this is
a separate run from the paired table. JSON transport and JS object construction
now rival or exceed the remaining parser work; removing the output memcpy is
still a low-priority optimization.

## Runtime compatibility, size and validation

The package now requires native WebAssembly exception handling. Node 24.16.0
(packed-package test), Node 26.12.1 (regressions/benchmarks), and the installed Edge
browser (main thread and module Workers, Vite dev and production) were tested.
Older engines without Wasm EH are not supported by this artifact. No JS-emulation
fallback is shipped. The runtime requirement is stated in the package README.

WASM: 723,909 → 554,542 bytes (23.4% smaller); gzip via Node zlib defaults:
189,583 → 158,616 bytes. The WASM loader shrank 65,554 → 55,404 bytes; the public
API JS remains 8,726 bytes. Asset size does not establish a heap-memory reduction.

41 parser tests passed, including repeated valid/invalid native-memory plateau
checks and explicit-vs-implicit initializers. All 52 pinned AOSP fixtures were
compared against the baseline with deep AST equality, and all eight benchmark
inputs retain equal ASTs/wire sizes. Production build, types, packed Node import,
Vite browser/Worker and intentional load-rejection checks passed. The consumer's
local `file:` dependency was refreshed, its WASM hash verified, and its 23 AIDL
tests, code-render tests and type check passed.

## Reproduction and local evidence

Snapshots under `build/benchmarks/`: `native-before/`, `native-tracking-only/`,
`native-exceptions-only/`. Reports: `native-tracking-comparison.json`,
`native-exceptions-comparison.json`, `native-defaults-comparison.json`,
`native-final-comparison.json`, `native-final-profile.json`, `native-sizes.json`.
Sampling traces and summaries: `native-tracking-removed.cpuprofile[.json]`,
`native-exceptions.cpuprofile[.json]`, `native-final.cpuprofile[.json]`.

```powershell
$env:BENCH_WARMUP = '30'
$env:BENCH_ITERATIONS = '60'
$env:BENCH_OUTPUT = 'build/benchmarks/native-final-comparison.json'
pnpm benchmark --compare build/benchmarks/native-before
mise exec -- node aidl-cpp/scripts/build.ts --profile
node scripts/profile-native.ts
```

The CPU sampling script supports additional cases and output paths; see
[development instructions](development.md#native-cpu-sampling). Profiling WASM
retains function names; production WASM does not include profiling exports.

---

# String serialization and compound-expression optimization — 2026-11-05

Two sequential changes preserve the public AST and private wire protocol:

- The native JSON writer appends unescaped ASCII directly, avoiding temporary
  JSON objects. Quotes, backslashes, controls and non-ASCII still use the existing
  nlohmann serializer, including its invalid UTF-8 replacement behavior.
- The build-local syntax parser stops reconstructing text for binary, unary,
  parenthesized and array expressions. Binary chains previously copied the
  complete left subtree at each level, giving quadratic text-copy work. Children,
  operators, source ranges, literal tokens and reference names remain intact.
  `ParseSource` does not call semantic evaluation or value diagnostics; the bridge
  reads compound children rather than their reconstructed text. This adaptation
  is specific to this syntax-only build, not a change to the upstream checkout.

## Combined result

Windows, Intel Core i9-14900HX, Node 26.12.1; 25 warmups and 40 measured samples
per variant, alternating public parse order in the same process. Initialization
is excluded. Each benchmark checks deep AST equality before sampling. The baseline
is the optimized source-range implementation immediately before these two changes.

| Input                               | Before p50 | After p50 | Reduction | Before p95 | After p95 |
| ----------------------------------- | ---------: | --------: | --------: | ---------: | --------: |
| Official `ITestService.aidl`        |    1.79 ms |   1.59 ms |     11.2% |    2.19 ms |   2.45 ms |
| 1,000 methods                       |    7.88 ms |   6.74 ms |     14.5% |    9.41 ms |   8.49 ms |
| 5,000 methods                       |   43.49 ms |  38.94 ms |     10.5% |   56.80 ms |  61.91 ms |
| 1,000 short constant expressions    |    8.98 ms |   7.66 ms |     14.7% |   10.61 ms |   8.85 ms |
| 1,000 methods with Unicode comments |    7.34 ms |   6.73 ms |      8.3% |    9.40 ms |   8.33 ms |
| 20 chains, 500 operands each        |   26.53 ms |  18.26 ms |     31.2% |   32.96 ms |  20.99 ms |
| 20 arrays, 500 elements each        |   12.38 ms |  10.64 ms |     14.1% |   16.04 ms |  11.29 ms |

Tail latencies are noisy: official and 5,000-method p95 did not improve in this
run. These measurements demonstrate median improvements, not a guarantee of
better p95. Compare variants within each paired run, not absolute numbers across
separate runs; stage medians are measured separately and are not additive.

## Step 1: serialization only

| Input                               | Before p50 | After p50 | Reduction | Before p95 | After p95 |
| ----------------------------------- | ---------: | --------: | --------: | ---------: | --------: |
| Official `ITestService.aidl`        |    1.63 ms |   1.45 ms |     10.5% |    2.14 ms |   1.89 ms |
| 1,000 methods                       |    7.24 ms |   5.96 ms |     17.6% |    8.90 ms |   7.93 ms |
| 5,000 methods                       |   39.33 ms |  33.14 ms |     15.7% |   45.09 ms |  40.28 ms |
| 1,000 short constant expressions    |    8.42 ms |   7.11 ms |     15.5% |   11.27 ms |  10.64 ms |
| 1,000 methods with Unicode comments |    6.44 ms |   5.73 ms |     11.1% |    7.50 ms |   6.51 ms |
| 20 chains, 500 operands each        |   20.22 ms |  17.03 ms |     15.8% |   23.91 ms |  19.96 ms |
| 20 arrays, 500 elements each        |    9.99 ms |   8.56 ms |     14.3% |   10.90 ms |   9.64 ms |

## Step 2: compound text removal only

Here the baseline already includes the serialization optimization.

| Input                               | Before p50 | After p50 | Reduction | Before p95 | After p95 |
| ----------------------------------- | ---------: | --------: | --------: | ---------: | --------: |
| Official `ITestService.aidl`        |    2.32 ms |   2.31 ms |      0.4% |    2.92 ms |   3.11 ms |
| 1,000 methods                       |    8.31 ms |   8.05 ms |      3.2% |    9.43 ms |   8.92 ms |
| 5,000 methods                       |   43.26 ms |  45.77 ms |     -5.8% |   56.78 ms |  85.47 ms |
| 1,000 short constant expressions    |    8.72 ms |   8.52 ms |      2.3% |   10.26 ms |  11.04 ms |
| 1,000 methods with Unicode comments |    6.95 ms |   6.90 ms |      0.7% |   11.33 ms |   8.49 ms |
| 20 chains, 500 operands each        |   19.37 ms |  15.79 ms |     18.5% |   22.81 ms |  17.80 ms |
| 20 arrays, 500 elements each        |   10.77 ms |  10.22 ms |      5.1% |   12.59 ms |  12.25 ms |

The useful additional gain is concentrated in long expressions (18.5%) and arrays
(5.1%); short expressions improve only 2.3%. There is no expected improvement for
method-only inputs. The initial 5,000-method sample showed a 5.8% median regression;
a follow-up with 40 warmups and 100 samples did not reproduce it (35.52 to 33.98 ms,
p95 46.57 to 45.91 ms). Treat these method-only differences as measurement variation,
not as evidence of an expression optimization benefit.

## Verification and artifacts

40 parser tests passed, including 52 pinned AOSP fixtures, unchanged AST snapshots,
string escaping/control/Unicode coverage, a 500-operand chain, unevaluated references
and division by zero, and repeated native allocation plateau checks. All eight
benchmark inputs retained equal public ASTs and equal wire sizes. Production build,
type checks, packed Node package, Vite development/production main-thread and Worker
tests passed. The consumer's 23 AIDL tests, code-render regression and type check
also passed. The upstream AOSP checkout is unchanged.

WASM changed from 725,751 bytes to 726,092 after serialization, then to 723,909 after
compound text removal. These are asset sizes, not heap measurements. The JavaScript
API implementation is unchanged in this round.

Local snapshots: `build/benchmarks/serialization-before/` and `serialization-only/`.
Local raw reports: `serialization-only-comparison.json`,
`serialization-final-comparison.json`, `compound-only-comparison.json`, and
`compound-methods-confirmation.json`, all under `build/benchmarks/`.
To repeat, set `BENCH_WARMUP=25`, `BENCH_ITERATIONS=40`, and `BENCH_OUTPUT`, then run
`pnpm benchmark --compare build/benchmarks/serialization-before` (combined) or
`pnpm benchmark --compare build/benchmarks/serialization-only` (step 2).
`BENCH_CASE=chains20x500` selects just the long-chain input.

---

# Source-range AST optimization — 2026-11-05

The public AST and private wire protocol are unchanged by this optimization.
The comparison baseline is the full source-range implementation immediately
before this optimization, not the earlier diagnostic-anchor API.

## Current paired measurements

Windows, Intel Core i9-14900HX, Node 26.12.1; 25 warmups and 40 measured samples
per variant. Public parses alternate order in the same process, yielding to the
event loop after each pair. Each input is checked for deep AST equality before
sampling. Times exclude WASM initialization.

| Input                               | Before p50 | After p50 | Reduction | Before p95 | After p95 |
| ----------------------------------- | ---------: | --------: | --------: | ---------: | --------: |
| Official `ITestService.aidl`        |    1.82 ms |   1.59 ms |     12.7% |    2.13 ms |   1.90 ms |
| 1,000 methods                       |    8.18 ms |   7.21 ms |     11.9% |    8.95 ms |   8.46 ms |
| 5,000 methods                       |   46.36 ms |  38.42 ms |     17.1% |   49.63 ms |  43.21 ms |
| 1,000 constant expressions          |    9.40 ms |   8.11 ms |     13.7% |   10.21 ms |   8.87 ms |
| 1,000 methods with Unicode comments |    7.16 ms |   6.55 ms |      8.5% |    8.69 ms |   7.56 ms |

The full `android-api-diff` adapter (`parseAIDLFile`) was also measured using
identical adapter code and swapping only the parser build. Its p50 changed from
1.98 to 1.78 ms for the official fixture, 8.85 to 7.67 ms for 1,000 methods,
53.56 to 47.10 ms for 5,000 methods, and 9.14 to 7.82 ms for 1,000 expressions.
API models were compared with deep equality. These figures isolate this
optimization; they do not quantify the earlier removal of source scanning.

**Compare paired results, not absolute numbers from different runs.** Earlier
runs on this machine showed much larger latencies. The 244 ms result previously
observed for 5,000 methods is not a valid baseline for the 38 ms result here.
Stage samples are separate from public parse samples and their medians are not
additive. In this paired run the JS decoding stage fell from 1.46 to 0.67 ms for
1,000 methods, and from 9.96 to 5.75 ms for 5,000 methods. Native calls improved
more modestly; JSON parsing and wire size are essentially unchanged.

## Implementation and size

- Native syntax ranges use two integer offsets instead of full filename/line/
  column location objects. Diagnostic locations remain separate.
- Only type declarations retain an extra original name; methods, arguments and
  other nodes use their existing names.
- UTF-16 conversion stores line starts and corrections for multibyte characters.
  ASCII inputs no longer allocate a per-byte offset map.
- The decoder constructs each node directly with a stable field layout, avoiding
  generic key traversal, recursive primitive handling and default-object merges.

WASM size: 751,552 to 725,751 bytes; gzip: 191,133 to 190,381 bytes. The API JS
bundle grew from 6,666 to 8,726 bytes (gzip 2,443 to 2,641 bytes). Public AST
information and wire sizes did not change. These are asset sizes, not heap-memory
measurements. The existing repeated-parse test checks that native capacity and
allocation reuse plateau across three batches of 1,000 mixed valid/invalid calls.

Verification: 36 parser tests passed, including 52 pinned AOSP source fixtures;
existing AST snapshots were unchanged. Type checks, packed Node import/type
checks, production builds and Vite development/production browser tests passed.
The browser harness refreshes its dependency cache when replacing an unpacked
package at the same version. The consumer's 23 AIDL tests and code-generation
regressions also passed with the optimized parser.

## Reproduce this comparison

Before modifying a build, preserve its `dist/`, `src/decode.ts`, and
`src/generated/wire.ts` under a snapshot directory. Then build the candidate and
run:

```powershell
$env:BENCH_WARMUP = '25'
$env:BENCH_ITERATIONS = '40'
$env:BENCH_OUTPUT = 'build/benchmarks/ranges-optimized-comparison.json'
pnpm benchmark --compare build/benchmarks/ranges-before
```

`--compare` requires the same public AST contract and verifies equality. The
snapshot is a local measurement artifact, not a source dependency. `BENCH_CASE`
selects one case; `BENCH_OUTPUT` selects the output file relative to the repository.

Local raw reports: `build/benchmarks/ranges-before-profile.json`,
`ranges-compact-comparison.json`, `ranges-optimized-comparison.json`,
`ranges-optimized-profile.json`, `adapter-optimized-comparison.json`, and
`ranges-optimized-sizes.json`. Reports below are from an older optimization.

---

# Historical transport optimization — 2026-11-05

The measurements below describe the earlier transport optimization, before the full source-range AST change. They are historical, not a performance claim for the current AST. Numeric enums, abbreviated keys, omitted defaults and location tuples are private to the C++ → TypeScript transport. Downloaded/public JSON still contains the readable API fields. AOSP remains `android-17.0.0_r1`; compilation and linking remain `-O3`.

## Measurements

Windows, Intel Core i9-14900HX, Node 26.12.1. Sizes are uncompressed bytes. Before/after public parse samples alternate order in the same process, with an event-loop yield between iterations. Native/UTF-8/JSON/decoder stages are sampled separately, so their medians must not be added to reproduce the public median.

| Case                                |  Old wire |  New wire | Reduction |
| ----------------------------------- | --------: | --------: | --------: |
| Small interface                     |     1,007 |       240 |     76.2% |
| Official `ITestService.aidl`        |   169,346 |    56,719 |     66.5% |
| 1,000 methods, 47,905 source bytes  | 1,027,981 |   269,727 |     73.8% |
| 5,000 methods, 243,905 source bytes | 5,195,981 | 1,405,727 |     72.9% |

The focused 1,000-method comparison used 20 warmups and 30 measured samples per version:

| Stage                                                 | Before p50 | After p50 |
| ----------------------------------------------------- | ---------: | --------: |
| Public parse                                          |  490.36 ms |  38.05 ms |
| Native call                                           |  435.60 ms |  27.98 ms |
| UTF-8 output decoding                                 |    2.87 ms |   0.68 ms |
| `JSON.parse`                                          |   16.32 ms |   5.05 ms |
| Old position normalization / new full result decoding |   70.78 ms |   5.40 ms |

Public p95 was 526.12 → 47.24 ms. The official fixture in the wider 10-warmup/15-sample run measured 16.23 → 1.82 ms p50; 5,000 methods measured 2,634.98 → 219.48 ms p50.

**Absolute timing varied considerably across runs.** A separate optimized-only 1,000-method run measured 6.26 ms public p50, with native parsing 2.32 ms, wire writing 1.62 ms, AST cleanup 0.10 ms and final copy 0.006 ms. This is a separate run, not an additional speedup over the paired comparison. The numbers establish a substantial improvement on this host, not a universal latency guarantee. The initial compact JSON DOM still spent most native time constructing JSON objects; the final implementation streams containers and numbers directly, retaining nlohmann's string escaping and UTF-8 replacement.

WASM shrank from 682,050 to 668,691 bytes. With Node's default `gzipSync`, compressed size is 189,551 → 185,100 bytes. JS glue remains approximately 42.55 kB. These sizes exclude the website's editor/UI bundle.

Raw reports are retained locally in `build/benchmarks/optimized-all.json`, `optimized.json` and `profile.json`. Reports include process-wide GC and memory totals; these combine multiple parser instances and do not measure isolated per-parse allocation or retained-memory savings.

## Reproduction

```powershell
pnpm build
$env:BENCH_CASE = 'methods1000'
$env:BENCH_WARMUP = '20'
$env:BENCH_ITERATIONS = '30'
pnpm benchmark --baseline
node aidl-cpp/scripts/build.ts --profile
pnpm benchmark --profile
```

`--baseline` needs the locally preserved pre-change `build/benchmarks/baseline/dist/` and `runtime.ts`; it is optional and not part of a fresh checkout. Without it, the command benchmarks the current package. Profiling outputs are separate from shipping assets.

## Verification

- Field-by-field old/new comparison of 52 pinned AOSP fixtures plus 10 supplemental cases; canonical SHA-256 snapshots retained in `aidl-parser/test/compatibility.json`.
- 14 tests passed, covering source positions, Chinese/emoji/CRLF, invalid literals, expressions, public defaults, private enum IDs, production export separation and latest-request queuing.
- Build, TypeScript checks, npm pack/extract/import/typecheck passed.
- Browser development and production `/verify/` preview passed: Worker/WASM loading, lazy tree expansion, readable JSON, syntax errors, recovery and latest-edit display. No browser console errors or warnings were observed.
- Upstream AOSP checkout remained unmodified.

## Profiling commands

`node aidl-cpp/scripts/build.ts --profile` creates separate instrumented assets under `aidl-cpp/build/wasm-profile/`; `pnpm benchmark --profile` reports native parsing, wire writing, cleanup and final buffer-copy timings. Profiling exports are absent from the npm assets. `BENCH_CASE`, `BENCH_WARMUP` and `BENCH_ITERATIONS` select a case and sample counts. Reports are written to `build/benchmarks/`. Optional `--baseline` compares the retained pre-optimization artifacts in `build/benchmarks/baseline/`, when available. Timing depends on runtime warmup and host load; process-wide memory/GC figures are not per-parse allocation measurements.
